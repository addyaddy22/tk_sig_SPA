import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name.trim(),
        phone: dto.phone?.trim() || null,
        passwordHash: await bcrypt.hash(dto.password, 10),
      },
      include: { therapist: { select: { id: true } } },
    });
    return this.issue(user, null);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      include: { therapist: { select: { id: true } } },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issue(user, user.therapist?.id ?? null);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { therapist: { select: { id: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    return AuthService.publicUser(user, user.therapist?.id ?? null);
  }

  private async issue(user: User, therapistId: string | null) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      therapistId,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: AuthService.publicUser(user, therapistId),
    };
  }

  static publicUser(user: User, therapistId: string | null) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      therapistId,
    };
  }
}
