import {BadRequestException} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {ImageStorageService, type UploadedImage} from './image-storage.service';

describe('ImageStorageService', () => {
  const values: Record<string, string> = {
    APPWRITE_ENDPOINT: 'https://example.appwrite.io/v1',
    APPWRITE_PROJECT_ID: 'project',
    APPWRITE_API_KEY: 'secret',
    APPWRITE_IMAGE_BUCKET_ID: 'bucket',
  };
  const service = new ImageStorageService({
    get: (key: string) => values[key],
  } as ConfigService);

  afterEach(() => jest.restoreAllMocks());

  it('uploads a real JPEG signature and returns its public view URL', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, {status: 201}));
    const file: UploadedImage = {
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      originalname: 'cover.jpg',
      mimetype: 'image/jpeg',
      size: 4,
    };

    const result = await service.upload(file, 'cover-story');

    expect(result.url).toContain(
      `/storage/buckets/bucket/files/${result.fileId}/view?project=project`
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.appwrite.io/v1/storage/buckets/bucket/files',
      expect.objectContaining({method: 'POST'})
    );
    const request = fetchMock.mock.calls[0][1];
    const form = request?.body as FormData;
    expect(form.get('permissions[]')).toBe('read("any")');
  });

  it('rejects a renamed non-image before contacting Appwrite', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const file: UploadedImage = {
      buffer: Buffer.from('not an image'),
      originalname: 'fake.png',
      mimetype: 'image/png',
      size: 12,
    };

    await expect(service.upload(file, 'profile-user')).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
