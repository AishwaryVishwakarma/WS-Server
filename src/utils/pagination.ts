export function paginate(page: number, limit: number) {
  const skip = (page - 1) * limit;
  return {skip, take: limit};
}

export function getPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
) {
  return {
    message: 'Success',
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
