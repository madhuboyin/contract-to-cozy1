import { Response } from 'express';
import { CustomRequest } from '../types';
import {
  CoverageAnalysisOverrides,
  ItemCoverageAnalysisOverrides,
  CoverageIntelligenceService,
  CoverageSimulationInput,
} from '../services/coverageAnalysis.service';
import { guidanceJourneyService } from '../services/guidanceEngine/guidanceJourney.service';

const service = new CoverageIntelligenceService();

export async function getCoverageAnalysis(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const result = await service.getLatest(propertyId, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error fetching coverage analysis:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch coverage analysis.',
    });
  }
}

export async function runCoverageAnalysis(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const overrides = (req.body?.overrides ?? {}) as CoverageAnalysisOverrides;
    const analysis = await service.run(propertyId, userId, overrides);

    const shouldEmitGuidanceSignal =
      analysis.overallVerdict !== 'NOT_WORTH_IT' ||
      analysis.insuranceVerdict === 'WORTH_IT' ||
      analysis.warrantyVerdict === 'WORTH_IT';

    if (shouldEmitGuidanceSignal) {
      try {
        await guidanceJourneyService.recordToolCompletion({
          propertyId,
          actorUserId: userId,
          signalIntentFamily: 'coverage_gap',
          issueDomain: 'INSURANCE',
          sourceToolKey: 'coverage-intelligence',
          sourceEntityType: 'COVERAGE_ANALYSIS',
          sourceEntityId: analysis.id,
          stepKey: 'check_coverage',
          status: 'COMPLETED',
          producedData: {
            overallVerdict: analysis.overallVerdict,
            insuranceVerdict: analysis.insuranceVerdict,
            warrantyVerdict: analysis.warrantyVerdict,
            confidence: analysis.confidence,
            insurance: analysis.insurance,
            warranty: analysis.warranty,
            nextSteps: analysis.nextSteps ?? [],
          },
        });
      } catch (guidanceError) {
        console.warn('[GUIDANCE] coverage analysis hook failed:', guidanceError);
      }
    }

    return res.json({ success: true, data: { analysis } });
  } catch (error: any) {
    console.error('Error running coverage analysis:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to run coverage analysis.',
    });
  }
}

export async function simulateCoverageAnalysis(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const payload = (req.body ?? {}) as CoverageSimulationInput;
    const analysis = await service.simulate(propertyId, userId, payload);
    return res.json({ success: true, data: { analysis } });
  } catch (error: any) {
    console.error('Error simulating coverage analysis:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to simulate coverage analysis.',
    });
  }
}

export async function getItemCoverageAnalysis(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const itemId = req.params.itemId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const result = await service.getLatestForItem(propertyId, itemId, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error fetching item coverage analysis:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch item coverage analysis.',
    });
  }
}

export async function runItemCoverageAnalysis(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const itemId = req.params.itemId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const overrides = (req.body?.overrides ?? {}) as ItemCoverageAnalysisOverrides;
    const analysis = await service.runItemAnalysis(propertyId, itemId, userId, overrides);

    const shouldEmitGuidanceSignal =
      analysis.overallVerdict !== 'NOT_WORTH_IT' ||
      analysis.insuranceVerdict === 'WORTH_IT' ||
      analysis.warrantyVerdict === 'WORTH_IT';

    if (shouldEmitGuidanceSignal) {
      try {
        await guidanceJourneyService.recordToolCompletion({
          propertyId,
          actorUserId: userId,
          inventoryItemId: itemId,
          signalIntentFamily: 'coverage_gap',
          issueDomain: 'INSURANCE',
          sourceToolKey: 'coverage-intelligence',
          sourceEntityType: 'COVERAGE_ANALYSIS',
          sourceEntityId: analysis.id,
          stepKey: 'check_coverage',
          status: 'COMPLETED',
          producedData: {
            overallVerdict: analysis.overallVerdict,
            insuranceVerdict: analysis.insuranceVerdict,
            warrantyVerdict: analysis.warrantyVerdict,
            confidence: analysis.confidence,
            item: analysis.item,
            warranty: analysis.warranty,
            nextSteps: analysis.nextSteps ?? [],
          },
        });
      } catch (guidanceError) {
        console.warn('[GUIDANCE] item coverage analysis hook failed:', guidanceError);
      }
    }

    return res.json({ success: true, data: { analysis } });
  } catch (error: any) {
    console.error('Error running item coverage analysis:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to run item coverage analysis.',
    });
  }
}
