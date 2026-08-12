import type {Queue} from 'bullmq';
import {DURABLE_JOB_OPTIONS} from 'src/jobs/queue.options';
import {MailService} from './mail.service';

describe('MailService', () => {
  it('durably enqueues email delivery', async () => {
    const queue = {add: jest.fn().mockResolvedValue({id: 'job-1'})};
    const service = new MailService(queue as unknown as Queue);

    await service.send('reader@test.com', 'Subject', 'Body', '<p>Body</p>');

    expect(queue.add).toHaveBeenCalledWith(
      'send',
      {
        to: 'reader@test.com',
        subject: 'Subject',
        text: 'Body',
        html: '<p>Body</p>',
      },
      DURABLE_JOB_OPTIONS
    );
  });
});
