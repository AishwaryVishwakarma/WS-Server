import {ConfigService} from '@nestjs/config';
import {getRepositoryToken} from '@nestjs/typeorm';
import {Test} from '@nestjs/testing';
import {User} from 'src/users/entities/user.entity';
import {DigestUnsubscribeService} from './digest-unsubscribe.service';

describe('DigestUnsubscribeService', () => {
  let service: DigestUnsubscribeService;
  let update: jest.Mock;

  beforeEach(async () => {
    update = jest.fn().mockResolvedValue({affected: 1});
    const module = await Test.createTestingModule({
      providers: [
        DigestUnsubscribeService,
        {provide: getRepositoryToken(User), useValue: {update}},
        {
          provide: ConfigService,
          useValue: {getOrThrow: jest.fn().mockReturnValue('test-secret')},
        },
      ],
    }).compile();
    service = module.get(DigestUnsubscribeService);
  });

  it('disables digest delivery for a valid signed token', async () => {
    const token = service.createToken('user-1');

    await expect(service.unsubscribe(token)).resolves.toBe(true);
    expect(update).toHaveBeenCalledWith(
      {id: 'user-1'},
      {digestEmailEnabled: false}
    );
  });

  it('ignores a tampered token without touching an account', async () => {
    const token = service.createToken('user-1');
    const tampered = `${token.slice(0, -1)}x`;

    await expect(service.unsubscribe(tampered)).resolves.toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});
