import { APIError } from '../middleware/error.middleware';

export type LoanEstimateExtractionConfidence = 'HIGH' | 'MEDIUM' | 'MISSING';

export type LoanEstimateExtractedField<T> = {
  value: T | null;
  confidence: LoanEstimateExtractionConfidence;
  sourceLabel: string;
};

export interface RefinanceLoanEstimateExtraction {
  fields: {
    loanAmountUsd: LoanEstimateExtractedField<number>;
    loanTermYears: LoanEstimateExtractedField<number>;
    loanType: LoanEstimateExtractedField<'FIXED' | 'ARM' | 'OTHER'>;
    noteRatePct: LoanEstimateExtractedField<number>;
    aprPct: LoanEstimateExtractedField<number>;
    monthlyPrincipalAndInterestUsd: LoanEstimateExtractedField<number>;
    loanCostsUsd: LoanEstimateExtractedField<number>;
    lenderCreditsUsd: LoanEstimateExtractedField<number>;
    cashToCloseUsd: LoanEstimateExtractedField<number>;
    fiveYearTotalPaidUsd: LoanEstimateExtractedField<number>;
    fiveYearPrincipalPaidUsd: LoanEstimateExtractedField<number>;
  };
  extractedFieldCount: number;
  requiredFieldCount: number;
  requiredFieldsFound: number;
  textLayerDetected: boolean;
  extractionMethod: 'PDF_TEXT' | 'IMAGE_OCR';
  documentConfidencePct: number | null;
  reviewRequired: true;
  warnings: string[];
}

const missing = <T>(sourceLabel: string): LoanEstimateExtractedField<T> => ({
  value: null,
  confidence: 'MISSING',
  sourceLabel,
});

function numberFrom(value: string): number | null {
  const parsed = Number(value.replace(/[,$\s]/g, ''));
  return Number.isFinite(parsed) ? Math.abs(parsed) : null;
}

function matchNumber(
  text: string,
  patterns: RegExp[],
  sourceLabel: string,
): LoanEstimateExtractedField<number> {
  for (let index = 0; index < patterns.length; index += 1) {
    const match = text.match(patterns[index]);
    const value = match?.[1] ? numberFrom(match[1]) : null;
    if (value != null) {
      return {
        value,
        confidence: index === 0 ? 'HIGH' : 'MEDIUM',
        sourceLabel,
      };
    }
  }
  return missing(sourceLabel);
}

function extractFiveYearValues(text: string): {
  total: LoanEstimateExtractedField<number>;
  principal: LoanEstimateExtractedField<number>;
} {
  const section = text.match(/In\s+5\s+Years([\s\S]{0,700})/i)?.[1] ?? '';
  const currencies = [...section.matchAll(/\$?\s*([\d,]+(?:\.\d{1,2})?)/g)]
    .map((match) => numberFrom(match[1]))
    .filter((value): value is number => value != null && value >= 100);
  const totalByLabel = matchNumber(
    text,
    [
      /In\s+5\s+Years[\s\S]{0,180}?\$?\s*([\d,]+(?:\.\d{1,2})?)\s+Total\s+you\s+will\s+have\s+paid/i,
      /Total\s+you\s+will\s+have\s+paid[ \t:$]*\$?[ \t]*([\d,]+(?:\.\d{1,2})?)/i,
    ],
    'Loan Estimate page 3 — In 5 Years total paid',
  );
  const principalByLabel = matchNumber(
    text,
    [
      /In\s+5\s+Years[\s\S]{0,400}?\$?\s*([\d,]+(?:\.\d{1,2})?)\s+Principal\s+you\s+will\s+have\s+paid\s+off/i,
      /Principal\s+you\s+will\s+have\s+paid\s+off[ \t:$]*\$?[ \t]*([\d,]+(?:\.\d{1,2})?)/i,
    ],
    'Loan Estimate page 3 — In 5 Years principal paid',
  );
  return {
    total:
      totalByLabel.value != null
        ? totalByLabel
        : currencies[0] != null
          ? {
              value: currencies[0],
              confidence: 'MEDIUM',
              sourceLabel: 'Loan Estimate page 3 — first In 5 Years amount',
            }
          : totalByLabel,
    principal:
      principalByLabel.value != null
        ? principalByLabel
        : currencies[1] != null
          ? {
              value: currencies[1],
              confidence: 'MEDIUM',
              sourceLabel: 'Loan Estimate page 3 — second In 5 Years amount',
            }
          : principalByLabel,
  };
}

export function extractLoanEstimateFieldsFromText(
  rawText: string,
): RefinanceLoanEstimateExtraction {
  const text = rawText.replace(/\u00a0/g, ' ').replace(/\r/g, '\n');
  const term = matchNumber(
    text,
    [
      /Loan\s+Term[ \t:]*([0-9]{1,2})\s*(?:years?|yrs?)/i,
      /([0-9]{1,2})[\s-]*(?:year|yr)\s+(?:fixed|adjustable|mortgage)/i,
    ],
    'Loan Terms — Loan Term',
  );
  const fixed = /Product[\s\S]{0,80}Fixed\s+Rate|fixed[\s-]*rate/i.test(text);
  const arm =
    /Product[\s\S]{0,80}(?:Adjustable|ARM)|adjustable[\s-]*rate|[357]\/1\s+ARM/i.test(
      text,
    );
  const loanType: RefinanceLoanEstimateExtraction['fields']['loanType'] =
    fixed || arm
      ? {
          value: arm ? 'ARM' : 'FIXED',
          confidence: 'HIGH',
          sourceLabel: 'Loan Terms — Product',
        }
      : missing('Loan Terms — Product');
  const fiveYear = extractFiveYearValues(text);
  const fields: RefinanceLoanEstimateExtraction['fields'] = {
    loanAmountUsd: matchNumber(
      text,
      [
        /Loan\s+Amount[ \t:$]*\$?[ \t]*([\d,]+(?:\.\d{1,2})?)/i,
        /\$?[ \t]*([\d,]+(?:\.\d{1,2})?)[ \t]+Loan\s+Amount/i,
      ],
      'Loan Terms — Loan Amount',
    ),
    loanTermYears: term,
    loanType,
    noteRatePct: matchNumber(
      text,
      [
        /Interest\s+Rate[ \t:]*([0-9]{1,2}(?:\.\d{1,4})?)\s*%/i,
        /([0-9]{1,2}(?:\.\d{1,4})?)\s*%\s+Interest\s+Rate/i,
      ],
      'Loan Terms — Interest Rate',
    ),
    aprPct: matchNumber(
      text,
      [
        /Annual\s+Percentage\s+Rate\s*\(APR\)[ \t:]*([0-9]{1,2}(?:\.\d{1,4})?)\s*%/i,
        /([0-9]{1,2}(?:\.\d{1,4})?)\s*%\s+Annual\s+Percentage\s+Rate\s*\(APR\)/i,
        /APR[ \t:]*([0-9]{1,2}(?:\.\d{1,4})?)\s*%/i,
      ],
      'Comparisons — Annual Percentage Rate (APR)',
    ),
    monthlyPrincipalAndInterestUsd: matchNumber(
      text,
      [
        /Monthly\s+Principal\s*&?\s*Interest[ \t:$]*\$?[ \t]*([\d,]+(?:\.\d{1,2})?)/i,
        /\$?[ \t]*([\d,]+(?:\.\d{1,2})?)[ \t]+Monthly\s+Principal\s*&?\s*Interest/i,
        /Principal\s*(?:&|and)\s*Interest[ \t:$]*\$?[ \t]*([\d,]+(?:\.\d{1,2})?)/i,
      ],
      'Loan Terms — Monthly Principal & Interest',
    ),
    loanCostsUsd: matchNumber(
      text,
      [
        /TOTAL\s+LOAN\s+COSTS(?:\s*\([^)]+\))?[ \t:$]*\$?[ \t]*([\d,]+(?:\.\d{1,2})?)/i,
        /\$?[ \t]*([\d,]+(?:\.\d{1,2})?)[ \t]+(?:D\.[ \t]*)?TOTAL\s+LOAN\s+COSTS/i,
        /Loan\s+Costs[ \t:$]*\$?[ \t]*([\d,]+(?:\.\d{1,2})?)/i,
      ],
      'Closing Cost Details — Total Loan Costs',
    ),
    lenderCreditsUsd: matchNumber(
      text,
      [
        /Lender\s+Credits[ \t:]*-?[ \t]*\$?[ \t]*([\d,]+(?:\.\d{1,2})?)/i,
        /-?[ \t]*\$?[ \t]*([\d,]+(?:\.\d{1,2})?)[ \t]+Lender\s+Credits/i,
      ],
      'Calculating Cash to Close — Lender Credits',
    ),
    cashToCloseUsd: matchNumber(
      text,
      [
        /Cash\s+to\s+Close[ \t:$]*\$?[ \t]*([\d,]+(?:\.\d{1,2})?)/i,
        /\$?[ \t]*([\d,]+(?:\.\d{1,2})?)[ \t]+(?:Estimated[ \t]+)?Cash\s+to\s+Close/i,
        /Estimated\s+Cash\s+to\s+Close[ \t:$]*\$?[ \t]*([\d,]+(?:\.\d{1,2})?)/i,
      ],
      'Calculating Cash to Close — Cash to Close',
    ),
    fiveYearTotalPaidUsd: fiveYear.total,
    fiveYearPrincipalPaidUsd: fiveYear.principal,
  };

  const values = Object.values(fields);
  const requiredKeys: Array<keyof typeof fields> = [
    'loanAmountUsd',
    'loanTermYears',
    'loanType',
    'noteRatePct',
    'aprPct',
    'monthlyPrincipalAndInterestUsd',
    'loanCostsUsd',
    'lenderCreditsUsd',
    'cashToCloseUsd',
  ];
  const extractedFieldCount = values.filter((field) => field.value != null).length;
  const requiredFieldsFound = requiredKeys.filter(
    (key) => fields[key].value != null,
  ).length;
  const textLayerDetected = text.trim().length >= 100;
  const warnings = [
    'Review every extracted value against the official Loan Estimate before comparing or saving.',
  ];
  if (!textLayerDetected) {
    warnings.push(
      'This PDF does not appear to contain a usable text layer. Enter the values manually; scanned-document OCR is not enabled in this slice.',
    );
  }
  if (requiredFieldsFound < requiredKeys.length) {
    warnings.push(
      `${requiredKeys.length - requiredFieldsFound} required comparison field(s) were not found and must be entered manually.`,
    );
  }

  return {
    fields,
    extractedFieldCount,
    requiredFieldCount: requiredKeys.length,
    requiredFieldsFound,
    textLayerDetected,
    extractionMethod: 'PDF_TEXT',
    documentConfidencePct: null,
    reviewRequired: true,
    warnings,
  };
}

export function extractLoanEstimateFieldsFromOcrText(
  rawText: string,
  documentConfidencePct: number | null,
): RefinanceLoanEstimateExtraction {
  const extraction = extractLoanEstimateFieldsFromText(rawText);
  const fields = Object.fromEntries(
    Object.entries(extraction.fields).map(([key, field]) => [
      key,
      {
        ...field,
        confidence:
          field.confidence === 'HIGH' ? 'MEDIUM' : field.confidence,
        sourceLabel:
          field.value == null ? field.sourceLabel : `${field.sourceLabel} — OCR`,
      },
    ]),
  ) as unknown as RefinanceLoanEstimateExtraction['fields'];
  const warnings = [
    'OCR can confuse digits, punctuation, and column order. Verify every populated value against the image.',
    ...extraction.warnings.filter(
      (warning) => !/PDF does not appear|OCR is not enabled/i.test(warning),
    ),
  ];
  if (rawText.trim().length < 100) {
    warnings.push(
      'The image did not produce enough readable text. Try a clearer, straight-on image or enter the fields manually.',
    );
  }
  return {
    ...extraction,
    fields,
    textLayerDetected: false,
    extractionMethod: 'IMAGE_OCR',
    documentConfidencePct:
      documentConfidencePct == null
        ? null
        : Math.max(0, Math.min(100, documentConfidencePct)),
    warnings,
  };
}

export async function extractLoanEstimateFromPdf(
  buffer: Buffer,
): Promise<RefinanceLoanEstimateExtraction> {
  try {
    const pdfParse = require('pdf-parse');
    const parsed = await pdfParse(buffer);
    return extractLoanEstimateFieldsFromText(parsed.text ?? '');
  } catch {
    throw new APIError(
      'The Loan Estimate PDF could not be read. Confirm that it is a valid, unencrypted PDF or enter the values manually.',
      422,
      'LOAN_ESTIMATE_PDF_UNREADABLE',
    );
  }
}

export async function extractLoanEstimateFromImage(
  buffer: Buffer,
): Promise<RefinanceLoanEstimateExtraction> {
  try {
    let preprocessed = buffer;
    try {
      const { default: sharp } = await import('sharp');
      preprocessed = await sharp(buffer, { failOn: 'none' })
        .rotate()
        .resize({ width: 2400, withoutEnlargement: false })
        .grayscale()
        .normalize()
        .sharpen({ sigma: 1 })
        .png({ compressionLevel: 9 })
        .toBuffer();
    } catch {
      // Tesseract can read JPEG and PNG buffers directly. Image
      // preprocessing improves recognition but must not be a hard dependency
      // for the review-first intake path.
    }
    const { createWorker } = await import('tesseract.js');
    const worker: any = await createWorker('eng');
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: '6',
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      });
      const result = await worker.recognize(preprocessed);
      return extractLoanEstimateFieldsFromOcrText(
        String(result?.data?.text ?? ''),
        typeof result?.data?.confidence === 'number'
          ? result.data.confidence
          : null,
      );
    } finally {
      await worker.terminate();
    }
  } catch (error) {
    if (error instanceof APIError) throw error;
    throw new APIError(
      'The Loan Estimate image could not be read. Try a clear PNG, JPEG, or WEBP image or enter the values manually.',
      422,
      'LOAN_ESTIMATE_IMAGE_UNREADABLE',
    );
  }
}

export async function extractLoanEstimateFromUpload(
  buffer: Buffer,
  mimeType: string,
): Promise<RefinanceLoanEstimateExtraction> {
  return mimeType === 'application/pdf'
    ? extractLoanEstimateFromPdf(buffer)
    : extractLoanEstimateFromImage(buffer);
}
