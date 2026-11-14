import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RateLimit } from '../common/rate-limit/rate-limit.guard.js';
import type { AuthUser } from '../common/types.js';
import { UsersService } from '../users/users.service.js';
import {
  EmailDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './auth.dto.js';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @RateLimit({ limit: 5, windowMs: 15 * 60_000 })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @RateLimit({ limit: 10, windowMs: 15 * 60_000 })
  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto);
  }

  @RateLimit({ limit: 3, windowMs: 10 * 60_000 })
  @Post('resend-verification')
  @HttpCode(200)
  resendVerification(@Body() dto: EmailDto) {
    return this.auth.resendVerification(dto);
  }

  @RateLimit({ limit: 10, windowMs: 60_000 })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @RateLimit({ limit: 5, windowMs: 15 * 60_000 })
  @Post('forgot-password')
  @HttpCode(200)
  forgotPassword(@Body() dto: EmailDto) {
    return this.auth.forgotPassword(dto);
  }

  @RateLimit({ limit: 5, windowMs: 15 * 60_000 })
  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  /**
   * JWTs are stateless, so logout is handled by the client discarding its token.
   * The endpoint exists so clients have a single place to call on logout.
   */
  @Post('logout')
  @HttpCode(204)
  logout() {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.getProfile(user.sub);
  }
}
