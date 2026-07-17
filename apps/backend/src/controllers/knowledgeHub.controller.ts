import { NextFunction, Request, Response } from 'express';
import { knowledgeHubService } from '../services/knowledgeHub.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { AuthRequest } from '../types/auth.types';
import { getAggregationContextEnvelope } from '../services/aggregationContext/context';

export async function listPublishedKnowledgeArticles(_req: Request, res: Response, next: NextFunction) {
  try {
    const articles = await knowledgeHubService.getPublishedKnowledgeArticles();
    res.json({ success: true, data: { articles } });
  } catch (error) {
    next(error);
  }
}

export async function listTargetedKnowledgeArticles(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user!.userId;
    const propertyContext = await getAggregationContextEnvelope(propertyId, userId, 'KNOWLEDGE_TARGETING');
    const articles = propertyContext.decision.status === 'APPLICABLE'
      ? await knowledgeHubService.getPublishedKnowledgeArticles()
      : [];
    return res.json({
      success: true,
      data: {
        articles,
        propertyContext,
        targetingApplied: propertyContext.decision.status === 'APPLICABLE',
      },
    });
  } catch (error) {
    return next(error);
  }
}

export async function getPublishedKnowledgeArticle(req: Request, res: Response, next: NextFunction) {
  try {
    const article = await knowledgeHubService.getPublishedKnowledgeArticleBySlug(req.params.slug);

    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Knowledge article not found.',
      });
    }

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ARTICLE_VIEWED,
      moduleKey: AnalyticsModule.KNOWLEDGE_HUB,
      featureKey: AnalyticsFeature.KNOWLEDGE_ARTICLE,
      metadataJson: { slug: req.params.slug },
    });

    return res.json({ success: true, data: { article } });
  } catch (error) {
    return next(error);
  }
}
