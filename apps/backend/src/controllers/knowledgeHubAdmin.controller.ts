import { NextFunction, Request, Response } from 'express';
import { knowledgeHubAdminService } from '../services/knowledgeHubAdmin.service';

function getStatusCode(error: unknown): number {
  return typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as { statusCode?: unknown }).statusCode === 'number'
    ? ((error as { statusCode: number }).statusCode)
    : 500;
}

export async function listKnowledgeArticlesForAdmin(_req: Request, res: Response, next: NextFunction) {
  try {
    const articles = await knowledgeHubAdminService.listKnowledgeArticlesForAdmin();
    res.json({ success: true, data: { articles } });
  } catch (error) {
    next(error);
  }
}

export async function getKnowledgeEditorOptions(_req: Request, res: Response, next: NextFunction) {
  try {
    const options = await knowledgeHubAdminService.getKnowledgeEditorOptions();
    res.json({ success: true, data: options });
  } catch (error) {
    next(error);
  }
}

export async function getKnowledgeArticleForAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const article = await knowledgeHubAdminService.getKnowledgeArticleForAdmin(req.params.id);

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

export async function createKnowledgeArticle(req: Request, res: Response, next: NextFunction) {
  try {
    const article = await knowledgeHubAdminService.createKnowledgeArticle(req.body);
    return res.status(201).json({ success: true, data: { article } });
  } catch (error) {
    const statusCode = getStatusCode(error);
    if (statusCode !== 500) {
      return res.status(statusCode).json({
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Knowledge article create failed.',
        },
      });
    }

    return next(error);
  }
}

export async function updateKnowledgeArticle(req: Request, res: Response, next: NextFunction) {
  try {
    const article = await knowledgeHubAdminService.updateKnowledgeArticle(req.params.id, req.body);
    return res.json({ success: true, data: { article } });
  } catch (error) {
    const statusCode = getStatusCode(error);
    if (statusCode !== 500) {
      return res.status(statusCode).json({
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Knowledge article update failed.',
        },
      });
    }

    return next(error);
  }
}
