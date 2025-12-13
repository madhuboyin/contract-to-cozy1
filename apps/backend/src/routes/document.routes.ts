// apps/backend/src/routes/document.routes.ts (MODIFIED)

import { Router, Response } from 'express';
import multer from 'multer'; 
import { authenticate } from '../middleware/auth.middleware';
// Use the unified, extended request type
import { CustomRequest } from '../types'; 
import { prisma } from '../lib/prisma';
import { documentIntelligenceService } from '../services/documentIntelligence.service';
import { DocumentType } from '@prisma/client';
import { validateDocumentUpload } from '../utils/documentValidator.util'; // Assuming this was added in the previous step

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
      const error = new Error('Invalid file type. Only JPEG, PNG, WEBP, and PDF documents are allowed.');
      (cb as (error: Error, acceptFile: boolean) => void)(error, false);
    }
  }
});

/**
 * @swagger
 * /api/documents/analyze:
 * post:
 * summary: Upload and analyze a document with AI
 * tags: [Documents]
 * security:
 * - bearerAuth: []
 * requestBody:
 * required: true
 * content:
 * multipart/form-data:
 * schema:
 * type: object
 * properties:
 * file:
 * type: string
 * format: binary
 * propertyId:
 * type: string
 * description: Optional ID of the property the document belongs to.
 * autoCreateWarranty:
 * type: boolean
 * responses:
 * 200:
 * description: Document analysis complete
 */
router.post('/analyze', authenticate, upload.single('file'), validateDocumentUpload, async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const file = req.file;
    const { propertyId, autoCreateWarranty } = req.body;

    if (propertyId) {
      // Basic check: Ensure the propertyId belongs to the authenticated user
      const isPropertyOwned = await prisma.property.findFirst({
        where: {
          id: propertyId,
          homeownerProfile: {
            userId: userId,
          },
        },
      });

      if (!isPropertyOwned) {
        return res.status(404).json({
          success: false,
          message: 'Property not found or access denied.'
        });
      }
    }

    if (!file) {
      return res.status(400).json({ success: false, message: 'File is required for analysis' });
    }

    console.log('[DOCUMENT-AI] Analyzing file:', file.originalname);

    // Analyze the document
    const insights = await documentIntelligenceService.analyzeDocument(
      file.buffer,
      file.mimetype
    );

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

    // Create document record
    const document = await prisma.document.create({
      data: {
        uploadedBy: homeownerProfile.id,
        propertyId: propertyId || null,
        type: mapDocumentType(insights.documentType),
        name: file.originalname,
        fileUrl: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
        fileSize: file.size,
        mimeType: file.mimetype,
        metadata: insights as any
      }
    });

    // Optionally auto-create warranty if requested
    let warranty = null;
    if (autoCreateWarranty === 'true' && propertyId && insights.documentType === 'WARRANTY') {
      warranty = await documentIntelligenceService.autoCreateWarranty(
        homeownerProfile.id,
        propertyId,
        insights,
        document.id
      );
    }

    res.json({
      success: true,
      data: {
        document,
        insights,
        warranty
      }
    });

  } catch (error: any) {
    console.error('[DOCUMENT-AI] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to analyze document'
    });
  }
});

/**
 * @swagger
 * /api/documents:
 * get:
 * summary: Get all documents for the current homeowner
 * tags: [Documents]
 * security:
 * - bearerAuth: []
 * responses:
 * 200:
 * description: List of documents
 */
router.get('/', authenticate, async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    // ... Existing logic ...
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

    const documents = await prisma.document.findMany({
      where: {
        uploadedBy: homeownerProfile.id
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: documents
    });

  } catch (error: any) {
    console.error('[DOCUMENTS] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve documents'
    });
  }
});

/**
 * @swagger
 * /api/documents/{id}:
 * delete:
 * summary: Delete a document
 * tags: [Documents]
 * security:
 * - bearerAuth: []
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * responses:
 * 200:
 * description: Document deleted
 */
router.delete('/:id', authenticate, async (req: CustomRequest, res: Response) => {
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
    console.error('[DOCUMENTS] Error deleting document:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete document'
    });
  }
});

export default router;