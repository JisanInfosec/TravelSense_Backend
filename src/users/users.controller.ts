import {
  Body,
  Controller,
  HttpCode,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RateLimit } from '../common/rate-limit/rate-limit.guard.js';
import type { AuthUser } from '../common/types.js';
import { MAX_UPLOAD_BYTES, UploadsService } from '../uploads/uploads.service.js';
import { ChangePasswordDto, UpdateProfileDto } from './users.dto.js';
import { UsersService } from './users.service.js';

@UseGuards(JwtAuthGuard)
@Controller('users/me')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly uploads: UploadsService,
  ) {}

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.sub, dto);
  }

  @Post('avatar')
  @RateLimit({ limit: 20, windowMs: 60 * 60_000 })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  async uploadAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const uploaded = await this.uploads.uploadImage(file, 'avatars');
    return this.users.updateProfile(user.sub, { avatarUrl: uploaded.url });
  }

  @Patch('password')
  @HttpCode(204)
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    await this.users.changePassword(user.sub, dto);
  }
}
