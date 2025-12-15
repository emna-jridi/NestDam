import {
  Controller,
  Get,
  Query,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SearchService } from './search.service';
import { SearchQueryDto, SearchResponseDto } from './dto/search.dto';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Global search across apps, alerts, and privacy tips',
  })
  @ApiResponse({
    status: 200,
    description: 'Search results retrieved successfully',
    type: SearchResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async search(@Req() req: any, @Query() query: SearchQueryDto) {
    try {
      if (!query.query || !query.query.trim()) {
        throw new BadRequestException('Query parameter is required');
      }

      const userId = req.user.userId;
      return await this.searchService.search(userId, query);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
