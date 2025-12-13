// apps/backend/src/routes/document.routes.ts

import { Router } from 'express';
import { Response } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { AuthRequest } from '../types/auth.types';
import { prisma } from '../lib/prisma';
import { documentIntelligenceService } from '../services/documentIntelligence.service';
import { DocumentType } from '@prisma/client';

const router = Router();

/**
 * Maps AI-detected document types to Prisma DocumentType enum
 */
function mapDocumentType(aiType: string): DocumentType {
  switch (aiType) {
    case 'WARRANTY':
    case 'RECEIPT':
    case 'MANUAL':
      return DocumentType.OTHER;
    case 'INSPECTION':
      return DocumentType.INSPECTION_REPORT;
    case 'INVOICE':
      return DocumentType.INVOICE;
    case 'INSURANCE':
      return DocumentType.INSURANCE_CERTIFICATE;
    case 'UNKNOWN':
    default:
      return DocumentType.OTHER;
  }
}

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept images and PDFs
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WEBP, and PDF are allowed.'));
    }
  }
});

/**
 * @swagger
 * /api/documents/analyze:
 *   post:
 *     summary: Upload and analyze document with AI
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *               - propertyId
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               propertyId:
 *                 type: string
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               autoCreateWarranty:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Document analyzed successfully
 */
router.post('/analyze', authenticate, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const file = req.file;
    const { propertyId, name, description, autoCreateWarranty = 'true' } = req.body;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    if (!propertyId) {
      return res.status(400).json({
        success: false,
        message: 'Property ID is required'
      });
    }

    // Get homeowner profile
    const homeownerProfile = await prisma.homeownerProfile.findUnique({
      where: { userId },
      select: { id: true }
    });

    if (!homeownerProfile) {
      return res.status(404).json({
        success: false,
        message: 'Homeowner profile not found'
      });
    }

    // Verify property belongs to user
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        homeownerProfileId: homeownerProfile.id
      }
    });

    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found or access denied'
      });
    }

    console.log('[DOCUMENT-UPLOAD] Analyzing document with AI...');

    // Analyze document with AI
    const insights = await documentIntelligenceService.analyzeDocument(
      file.buffer,
      file.mimetype
    );

    console.log('[DOCUMENT-UPLOAD] AI Analysis complete:', {
      type: insights.documentType,
      confidence: insights.confidence,
      hasData: Object.keys(insights.extractedData).length
    });

    // For this implementation, we'll store the file as base64 in the database
    // In production, you'd upload to S3/GCS and store the URL
    const fileUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

    // Create document record
    const document = await prisma.document.create({
      data: {
        uploadedBy: homeownerProfile.id,
        type: mapDocumentType(insights.documentType),
        name: name || insights.extractedData.productName || file.originalname,
        fileUrl,
        fileSize: file.size,
        mimeType: file.mimetype,
        description: description || null,
        propertyId,
        metadata: {
          aiInsights: insights,
          confidence: insights.confidence,
        } as any,
      }
    });

    console.log('[DOCUMENT-UPLOAD] Document saved:', document.id);

    // Auto-create warranty if applicable
    let warranty = null;
    if (autoCreateWarranty === 'true' && insights.documentType === 'WARRANTY') {
      warranty = await documentIntelligenceService.autoCreateWarranty(
        homeownerProfile.id,
        propertyId,
        insights,
        document.id
      );

      if (warranty) {
        console.log('[DOCUMENT-UPLOAD] Auto-created warranty:', warranty.id);
      }
    }

    res.json({
      success: true,
      data: {
        document: {
          id: document.id,
          name: document.name,
          type: document.type,
          createdAt: document.createdAt
        },
        insights,
        warranty: warranty ? {
          id: warranty.id,
          providerName: warranty.providerName,
          expiryDate: warranty.expiryDate
        } : null
      }
    });

  } catch (error: any) {
    console.error('[DOCUMENT-UPLOAD] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to analyze document'
    });
  }
});

/**
 * @swagger
 * /api/documents:
 *   get:
 *     summary: List all documents for user
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: propertyId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of documents
 */
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { propertyId } = req.query;

    const homeownerProfile = await prisma.homeownerProfile.findUnique({
      where: { userId },
      select: { id: true }
    });

    if (!homeownerProfile) {
      return res.status(404).json({
        success: false,
        message: 'Homeowner profile not found'
      });
    }

    const where: any = {
      uploadedBy: homeownerProfile.id
    };

    if (propertyId) {
      where.propertyId = propertyId as string;
    }

    const documents = await prisma.document.findMany({
      where,
      select: {
        id: true,
        name: true,
        type: true,
        fileSize: true,
        mimeType: true,
        metadata: true,
        propertyId: true,
        createdAt: true,
        property: {
          select: {
            name: true,
            address: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      data: {
        documents
      }
    });

  } catch (error: any) {
    console.error('[DOCUMENTS-LIST] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch documents'
    });
  }
});

/**
 * @swagger
 * /api/documents/{id}:
 *   delete:
 *     summary: Delete a document
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Document deleted
 */
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const homeownerProfile = await prisma.homeownerProfile.findUnique({
      where: { userId },
      select: { id: true }
    });

    if (!homeownerProfile) {
      return res.status(404).json({
        success: false,
        message: 'Homeowner profile not found'
      });
    }

    // Verify ownership
    const document = await prisma.document.findFirst({
      where: {
        id,
        uploadedBy: homeownerProfile.id
      }
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    await prisma.document.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });

  } catch (error: any) {
    console.error('[DOCUMENT-DELETE] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete document'
    });
  }
});

export default router;