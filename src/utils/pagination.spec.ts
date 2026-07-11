import {getPaginatedResponse, paginate} from './pagination';

describe('paginate', () => {
  it('computes skip/take for the first page', () => {
    expect(paginate(1, 20)).toEqual({skip: 0, take: 20});
  });

  it('computes skip/take for later pages', () => {
    expect(paginate(3, 10)).toEqual({skip: 20, take: 10});
  });
});

describe('getPaginatedResponse', () => {
  it('wraps data with pagination metadata', () => {
    const data = [{id: 1}, {id: 2}];

    expect(getPaginatedResponse(data, 45, 2, 20)).toEqual({
      message: 'Success',
      data,
      total: 45,
      page: 2,
      limit: 20,
      totalPages: 3,
    });
  });
});
