import {IsOptional, IsString, MaxLength} from 'class-validator';
import {PaginationDto} from './pagination.dto';

// Pagination plus a free-text filter; what it matches is up to the endpoint.
export class SearchPaginationDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
