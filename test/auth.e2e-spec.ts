import {INestApplication, ValidationPipe} from '@nestjs/common';
import {Test, TestingModule} from '@nestjs/testing';
import request from 'supertest';
import {App} from 'supertest/types';
import {AuthController} from '../src/auth/auth.controller';
import {AuthService} from '../src/auth/auth.service';
import {Role} from '../src/users/enums/role';

// HTTP-level tests for the auth endpoints. The service layer is mocked so no
// MySQL/Redis is needed; sessions are injected via test headers.
describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;
  let authService: {
    register: jest.Mock;
    login: jest.Mock;
    logout: jest.Mock;
  };

  const registeredUser = {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    role: Role.User,
  };

  beforeEach(async () => {
    authService = {
      register: jest.fn().mockResolvedValue(registeredUser),
      login: jest.fn().mockResolvedValue(registeredUser),
      logout: jest.fn().mockResolvedValue(undefined),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{provide: AuthService, useValue: authService}],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Same configuration as main.ts — whitelist is what strips unknown fields
    app.useGlobalPipes(new ValidationPipe({transform: true, whitelist: true}));

    // Fake session middleware driven by test headers
    app.use((req, res, next) => {
      req.session = {
        userId: req.headers['x-test-user-id'],
        role: req.headers['x-test-role'],
      };
      next();
    });

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    const validPayload = {
      name: 'Test User',
      email: 'test@example.com',
      password: 'S3cret!Password',
    };

    it('registers a user with a valid payload', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(validPayload)
        .expect(201);

      expect(authService.register).toHaveBeenCalledWith(
        expect.objectContaining(validPayload),
        expect.anything()
      );
    });

    it('strips privileged fields before they reach the service', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          ...validPayload,
          role: 'admin',
          isVerified: true,
          isBlocked: false,
        })
        .expect(201);

      const dto = authService.register.mock.calls[0][0];
      expect(dto).not.toHaveProperty('role');
      expect(dto).not.toHaveProperty('isVerified');
      expect(dto).not.toHaveProperty('isBlocked');
    });

    it('rejects weak passwords', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({...validPayload, password: 'weak'})
        .expect(400);

      expect(authService.register).not.toHaveBeenCalled();
    });

    it('rejects registration while already logged in', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .set('x-test-user-id', 'user-1')
        .send(validPayload)
        .expect(400);

      expect(authService.register).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/login', () => {
    it('logs in with valid credentials', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({email: 'test@example.com', password: 'S3cret!Password'})
        .expect(201);

      expect(authService.login).toHaveBeenCalled();
    });

    it('rejects login while already logged in', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-test-user-id', 'user-1')
        .send({email: 'test@example.com', password: 'S3cret!Password'})
        .expect(400);
    });
  });

  describe('POST /auth/logout', () => {
    it('rejects logout without a session', async () => {
      await request(app.getHttpServer()).post('/auth/logout').expect(401);

      expect(authService.logout).not.toHaveBeenCalled();
    });

    it('logs out an authenticated user', async () => {
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('x-test-user-id', 'user-1')
        .expect(204);

      expect(authService.logout).toHaveBeenCalled();
    });
  });
});
