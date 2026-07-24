import {BadRequestException, ValidationPipe} from '@nestjs/common';
import {CreateTagDto} from './create-tag.dto';
import {UpdateTagDto} from './update-tag.dto';

const pipe = new ValidationPipe({transform: true, whitelist: true});

const transform = (metatype: any, value: Record<string, unknown>) =>
  pipe.transform(value, {type: 'body', metatype});

describe('Tag DTO validation', () => {
  describe('CreateTagDto', () => {
    it('accepts a valid tag name', async () => {
      const result = await transform(CreateTagDto, {name: 'body-horror'});

      expect(result.name).toBe('body-horror');
    });

    it('rejects a profane tag name', async () => {
      await expect(transform(CreateTagDto, {name: 'sh1t-tag'})).rejects.toThrow(
        BadRequestException
      );
    });

    it('allows dark/horror vocabulary (this is a horror site)', async () => {
      const result = await transform(CreateTagDto, {name: 'cursed-corpse'});

      expect(result.name).toBe('cursed-corpse');
    });
  });

  describe('UpdateTagDto (inherits validation from CreateTagDto)', () => {
    it('rejects a profane tag name', async () => {
      await expect(transform(UpdateTagDto, {name: 'a55hole'})).rejects.toThrow(
        BadRequestException
      );
    });
  });
});
