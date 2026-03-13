import { NextFunction, Request, Response } from 'express';
import { knowledgeHubService } from '../services/knowledgeHub.service';

export async function listPublishedKnowledgeArticles(_req: Request, res: Response, next: NextFunction) {
  try {
    const articles = await knowledgeHubService.getPublishedKnowledgeArticles();
    res.json({ success: true, data: { articles } });
  } catch (error) {
    next(error);
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

    return res.json({ success: true, data: { article } });
  } catch (error) {
    return next(error);
  }
}
