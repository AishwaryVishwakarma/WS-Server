import {ReadingProgressService} from './reading-progress.service';
import {Role} from 'src/users/enums/role';

describe('ReadingProgressService', () => {
  const repository = {
    upsert: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const stories = {assertVisible: jest.fn()};
  const service = new ReadingProgressService(
    repository as never,
    stories as never
  );

  beforeEach(() => jest.clearAllMocks());

  it('does no database work below the persistence threshold', async () => {
    await service.set('user-1', 'story-1', 4, Role.User);

    expect(stories.assertVisible).not.toHaveBeenCalled();
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('uses the lightweight visibility guard before upserting progress', async () => {
    await service.set('user-1', 'story-1', 42, Role.User);

    expect(stories.assertVisible).toHaveBeenCalledWith(
      'story-1',
      'user-1',
      Role.User
    );
    expect(repository.upsert).toHaveBeenCalledWith(
      {
        user: {id: 'user-1'},
        story: {id: 'story-1'},
        percent: 42,
      },
      {conflictPaths: ['user', 'story']}
    );
  });
});
