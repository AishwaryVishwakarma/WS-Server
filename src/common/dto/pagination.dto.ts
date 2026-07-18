import {Type} from 'class-transformer';
import {IsInt, IsOptional, Max, Min} from 'class-validator';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // Cap the page so a crawler can't force an enormous OFFSET scan
  // (?page=1000000 would make MySQL read and discard millions of rows).
  @Max(100_000)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
