import {IsEnum} from 'class-validator';
import {RecommendationFeedbackAction} from '../enums/recommendation-feedback-action.enum';

export class RecommendationFeedbackDto {
  @IsEnum(RecommendationFeedbackAction)
  action: RecommendationFeedbackAction;
}
