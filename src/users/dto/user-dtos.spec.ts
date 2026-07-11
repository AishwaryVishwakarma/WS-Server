import {BadRequestException, ValidationPipe} from '@nestjs/common';
import {Role} from '../enums/role';
import {CreateUserDto} from './create-user.dto';
import {RegisterUserDto} from './register-user.dto';
import {UpdateProfileDto} from './update-profile.dto';

// Mirrors the global pipe configuration in main.ts — these tests guard
// against privilege escalation through self-service endpoints.
const pipe = new ValidationPipe({transform: true, whitelist: true});

const transform = (metatype: any, value: Record<string, unknown>) =>
  pipe.transform(value, {type: 'body', metatype});

const validRegistration = {
  name: 'Test User',
  email: 'test@example.com',
  password: 'S3cret!Password',
};

describe('User DTO validation', () => {
  describe('RegisterUserDto (public registration)', () => {
    it('accepts a valid registration payload', async () => {
      const result = await transform(RegisterUserDto, validRegistration);

      expect(result).toMatchObject(validRegistration);
    });

    it('strips privileged fields (role, isVerified, isBlocked)', async () => {
      const result = await transform(RegisterUserDto, {
        ...validRegistration,
        role: Role.Admin,
        isVerified: true,
        isBlocked: false,
      });

      expect(result).not.toHaveProperty('role');
      expect(result).not.toHaveProperty('isVerified');
      expect(result).not.toHaveProperty('isBlocked');
    });

    it('rejects weak passwords', async () => {
      await expect(
        transform(RegisterUserDto, {...validRegistration, password: 'weak'})
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid emails', async () => {
      await expect(
        transform(RegisterUserDto, {
          ...validRegistration,
          email: 'not-an-email',
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('UpdateProfileDto (self-service PATCH /users/me)', () => {
    it('strips privileged fields (role, isVerified, isBlocked)', async () => {
      const result = await transform(UpdateProfileDto, {
        bio: 'Hello',
        role: Role.Admin,
        isVerified: true,
        isBlocked: false,
      });

      expect(result).toEqual({bio: 'Hello'});
    });
  });

  describe('CreateUserDto (admin-only)', () => {
    it('keeps privileged fields for admin usage', async () => {
      const result = await transform(CreateUserDto, {
        ...validRegistration,
        role: Role.Admin,
        isVerified: true,
      });

      expect(result.role).toBe(Role.Admin);
      expect(result.isVerified).toBe(true);
    });

    it('rejects invalid role values', async () => {
      await expect(
        transform(CreateUserDto, {...validRegistration, role: 'superuser'})
      ).rejects.toThrow(BadRequestException);
    });
  });
});
