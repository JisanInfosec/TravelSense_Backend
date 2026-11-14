import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { Role } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BCRYPT_ROUNDS } from '../common/utils/password.js';
import type { AuthUser } from '../common/types.js';
import { EmailService } from '../email/email.service.js';
import { publicUserSelect } from '../users/users.service.js';
import type {
  EmailDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './auth.dto.js';

const MAX_OTP_ATTEMPTS = 5;

function hashSecret(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function secretMatches(hash: string, value: string) {
  const expected = Buffer.from(hash, 'hex');
  const actual = Buffer.from(hashSecret(value), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

@Injectable()
export class AuthService {
  private readonly dummyHash = bcrypt.hashSync(
    'timing-equaliser',
    BCRYPT_ROUNDS,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  /** Public registration always creates TOURIST accounts. */
  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (exists?.emailVerifiedAt)
      throw new ConflictException('An account with this email already exists.');

    const otp = this.generateOtp();
    const expiresMinutes = this.positiveInt(
      'EMAIL_VERIFICATION_OTP_EXPIRES_MINUTES',
      10,
    );
    const data = {
      name: dto.name,
      passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
      role: Role.TOURIST,
      emailVerificationOtpHash: hashSecret(otp),
      emailVerificationOtpExpiresAt: new Date(
        Date.now() + expiresMinutes * 60_000,
      ),
      emailVerificationOtpSentAt: new Date(),
      emailVerificationOtpAttempts: 0,
    };
    if (exists) {
      await this.prisma.user.update({ where: { id: exists.id }, data });
    } else {
      await this.prisma.user.create({ data: { ...data, email: dto.email } });
    }
    await this.email.sendVerificationOtp(
      dto.email,
      dto.name,
      otp,
      expiresMinutes,
    );
    return {
      email: dto.email,
      message: 'We sent a six-digit verification code to your email.',
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const record = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!record)
      throw new BadRequestException(
        'The verification code is invalid or has expired.',
      );
    if (record.emailVerifiedAt)
      throw new BadRequestException(
        'This email is already verified. Please log in.',
      );
    if (
      !record.emailVerificationOtpHash ||
      !record.emailVerificationOtpExpiresAt ||
      record.emailVerificationOtpExpiresAt <= new Date()
    ) {
      await this.clearVerificationOtp(record.id);
      throw new BadRequestException(
        'The verification code is invalid or has expired. Request a new code.',
      );
    }
    if (!secretMatches(record.emailVerificationOtpHash, dto.otp)) {
      const attempts = record.emailVerificationOtpAttempts + 1;
      await this.prisma.user.update({
        where: { id: record.id },
        data:
          attempts >= MAX_OTP_ATTEMPTS
            ? {
                emailVerificationOtpHash: null,
                emailVerificationOtpExpiresAt: null,
                emailVerificationOtpSentAt: null,
                emailVerificationOtpAttempts: attempts,
              }
            : { emailVerificationOtpAttempts: attempts },
      });
      throw new BadRequestException(
        attempts >= MAX_OTP_ATTEMPTS
          ? 'Too many incorrect attempts. Request a new verification code.'
          : 'The verification code is incorrect.',
      );
    }

    const user = await this.prisma.user.update({
      where: { id: record.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerificationOtpHash: null,
        emailVerificationOtpExpiresAt: null,
        emailVerificationOtpSentAt: null,
        emailVerificationOtpAttempts: 0,
      },
      select: publicUserSelect,
    });
    return { user, accessToken: await this.sign(user) };
  }

  async resendVerification(dto: EmailDto) {
    const record = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    const message =
      'If an unverified account exists, a new verification code has been sent.';
    if (!record || record.emailVerifiedAt) return { message };

    const cooldownSeconds = this.positiveInt(
      'EMAIL_RESEND_COOLDOWN_SECONDS',
      60,
    );
    if (
      record.emailVerificationOtpSentAt &&
      Date.now() - record.emailVerificationOtpSentAt.getTime() <
        cooldownSeconds * 1000
    ) {
      throw new BadRequestException(
        `Please wait ${cooldownSeconds} seconds before requesting another code.`,
      );
    }
    const otp = this.generateOtp();
    const expiresMinutes = this.positiveInt(
      'EMAIL_VERIFICATION_OTP_EXPIRES_MINUTES',
      10,
    );
    await this.prisma.user.update({
      where: { id: record.id },
      data: {
        emailVerificationOtpHash: hashSecret(otp),
        emailVerificationOtpExpiresAt: new Date(
          Date.now() + expiresMinutes * 60_000,
        ),
        emailVerificationOtpSentAt: new Date(),
        emailVerificationOtpAttempts: 0,
      },
    });
    try {
      await this.email.sendVerificationOtp(
        record.email,
        record.name,
        otp,
        expiresMinutes,
      );
    } catch (error) {
      await this.prisma.user.update({
        where: { id: record.id },
        data: {
          emailVerificationOtpHash: record.emailVerificationOtpHash,
          emailVerificationOtpExpiresAt: record.emailVerificationOtpExpiresAt,
          emailVerificationOtpSentAt: record.emailVerificationOtpSentAt,
          emailVerificationOtpAttempts: record.emailVerificationOtpAttempts,
        },
      });
      throw error;
    }
    return { message };
  }

  async login(dto: LoginDto) {
    const record = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    // Compare against a dummy hash when the user is missing to keep timing similar.
    const ok = await bcrypt.compare(
      dto.password,
      record?.passwordHash ?? this.dummyHash,
    );
    if (!record || !ok)
      throw new UnauthorizedException('Incorrect email or password.');
    if (!record.emailVerifiedAt) {
      throw new ForbiddenException(
        'Verify your email before logging in. You can request a new verification code.',
      );
    }
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: record.id },
      select: publicUserSelect,
    });
    return { user, accessToken: await this.sign(user) };
  }

  async forgotPassword(dto: EmailDto) {
    const record = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    const message =
      'If an account exists for this email, a password reset link has been sent.';
    if (!record?.emailVerifiedAt) return { message };

    const token = randomBytes(32).toString('hex');
    const expiresMinutes = this.positiveInt(
      'PASSWORD_RESET_EXPIRES_MINUTES',
      30,
    );
    await this.prisma.user.update({
      where: { id: record.id },
      data: {
        passwordResetTokenHash: hashSecret(token),
        passwordResetTokenExpiresAt: new Date(
          Date.now() + expiresMinutes * 60_000,
        ),
        passwordResetRequestedAt: new Date(),
      },
    });
    const frontendUrl = this.config
      .get('FRONTEND_URL', 'http://localhost:3000')
      .replace(/\/$/, '');
    try {
      await this.email.sendPasswordReset(
        record.email,
        record.name,
        `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}`,
        expiresMinutes,
      );
    } catch (error) {
      await this.clearPasswordReset(record.id);
      throw error;
    }
    return { message };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const result = await this.prisma.user.updateMany({
      where: {
        passwordResetTokenHash: hashSecret(dto.token),
        passwordResetTokenExpiresAt: { gt: new Date() },
        emailVerifiedAt: { not: null },
      },
      data: {
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
        passwordResetTokenHash: null,
        passwordResetTokenExpiresAt: null,
        passwordResetRequestedAt: null,
      },
    });
    if (!result.count)
      throw new BadRequestException(
        'This password reset link is invalid or has expired.',
      );
    return { message: 'Your password has been reset. You can now log in.' };
  }

  private generateOtp() {
    const testOtp = this.config.get<string>('AUTH_TEST_OTP');
    if (
      testOtp &&
      this.config.get('NODE_ENV') !== 'production' &&
      /^\d{6}$/.test(testOtp)
    )
      return testOtp;
    return String(randomInt(100_000, 1_000_000));
  }

  private positiveInt(key: string, fallback: number) {
    const value = Number(this.config.get(key, String(fallback)));
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }

  private clearVerificationOtp(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerificationOtpHash: null,
        emailVerificationOtpExpiresAt: null,
        emailVerificationOtpSentAt: null,
        emailVerificationOtpAttempts: 0,
      },
    });
  }

  private clearPasswordReset(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordResetTokenHash: null,
        passwordResetTokenExpiresAt: null,
        passwordResetRequestedAt: null,
      },
    });
  }

  private sign(user: { id: string; email: string; role: Role; name: string }) {
    const payload: AuthUser = {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };
    return this.jwt.signAsync(payload);
  }
}
