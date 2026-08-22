import {ConfigService} from '@nestjs/config';
import {getRepositoryToken} from '@nestjs/typeorm';
import {Test} from '@nestjs/testing';
import {User} from 'src/users/entities/user.entity';
import {WinbackUnsubscribeService} from './winback-unsubscribe.service';

describe('WinbackUnsubscribeService', () => {
  let service: WinbackUnsubscribeService;
  let update: jest.Mock;

  beforeEach(async () => {
    update = jest.fn().mockResolvedValue({affected: 1});
    const module = await Test.createTestingModule({
      providers: [
        WinbackUnsubscribeService,
        {provide: getRepositoryToken(User), useValue: {update}},
        {
          provide: ConfigService,
          useValue: {getOrThrow: jest.fn().mockReturnValue('test-secret')},
        },
      ],
    }).compile();
    service = module.get(WinbackUnsubscribeService);
  });

  it('disables win-back delivery for a valid signed token', async () => {
    const token = service.createToken('user-1');

    await expect(service.unsubscribe(token)).resolves.toBe(true);
    expect(update).toHaveBeenCalledWith(
      {id: 'user-1'},
      {winbackEmailEnabled: false}
    );
  });

  it('ignores a tampered token without touching an account', async () => {
    const token = service.createToken('user-1');
    const tampered = `${token.slice(0, -1)}x`;

    await expect(service.unsubscribe(tampered)).resolves.toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('uses a token distinct from DigestUnsubscribeService (different context)', async () => {
    // A token minted for a different HMAC context must never validate here —
    // otherwise the two unsubscribe flows would be interchangeable, silently
    // letting one email's link toggle the other's flag.
    const token = service.createToken('user-1');
    const [payload] = token.split('.');
    const wrongContextToken = `${payload}.not-a-real-signature-for-this-context`;

    await expect(service.unsubscribe(wrongContextToken)).resolves.toBe(false);
  });
});
