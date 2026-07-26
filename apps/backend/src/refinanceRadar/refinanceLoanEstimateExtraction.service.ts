import { APIError } from '../middleware/error.middleware';

export type LoanEstimateExtractionConfidence = 'HIGH' | 'MEDIUM' | 'MISSING';
export type LoanEstimatePageNumber = 1 | 2 | 3;
export type LoanEstimatePageSetStatus =
  | 'COMPLETE'
  | 'PARTIAL'
  | 'DUPLICATE'
  | 'OUT_OF_ORDER'
  | 'UNVERIFIED';

export type LoanEstimatePageIntegrity = {
  status: LoanEstimatePageSetStatus;
  detectedPages: LoanEstimatePageNumber[];
  missingPages: LoanEstimatePageNumber[];
  duplicatePages: LoanEstimatePageNumber[];
  outOfOrder: boolean;
};

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
  extractionMethod: 'PDF_TEXT' | 'IMAGE_OCR' | 'PDF_OCR';
  documentConfidencePct: number | null;
  pageCount: number;
  pageIntegrity: LoanEstimatePageIntegrity;
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

const LOAN_ESTIMATE_PAGE_SIGNALS: Record<
  LoanEstimatePageNumber,
  RegExp[]
> = {
  1: [
    /\bLOAN\s+TERMS?\b/i,
    /\bPROJECTED\s+PAYMENTS?\b/i,
    /\bCOSTS?\s+AT\s+CLOSING\b/i,
    /\bLOAN\s+AMOUNT\b/i,
    /\bINTEREST\s+RATE\b/i,
  ],
  2: [
    /\bCLOSING\s+COST\s+DETAILS\b/i,
    /\bTOTAL\s+LOAN\s+COSTS\b/i,
    /\bORIGINATION\s+CHARGES\b/i,
    /\bOTHER\s+COSTS\b/i,
    /\bCALCULATING\s+CASH\s+TO\s+CLOSE\b/i,
    /\bLENDER\s+CREDITS\b/i,
  ],
  3: [
    /\bCOMPARISONS?\b/i,
    /\bIN\s+5\s+YEARS\b/i,
    /\bANNUAL\s+PERCENTAGE\s+RATE\b/i,
    /\bOTHER\s+CONSIDERATIONS\b/i,
    /\bCONFIRM\s+RECEIPT\b/i,
  ],
};

export function detectLoanEstimatePages(
  rawText: string,
): LoanEstimatePageNumber[] {
  return ([1, 2, 3] as LoanEstimatePageNumber[]).filter((pageNumber) => {
    const score = LOAN_ESTIMATE_PAGE_SIGNALS[pageNumber].filter((pattern) =>
      pattern.test(rawText),
    ).length;
    return score >= 2;
  });
}

export function analyzeLoanEstimatePageSet(
  detectedPages: LoanEstimatePageNumber[],
): LoanEstimatePageIntegrity {
  const expectedPages: LoanEstimatePageNumber[] = [1, 2, 3];
  const duplicatePages = expectedPages.filter(
    (pageNumber) =>
      detectedPages.filter((detected) => detected === pageNumber).length > 1,
  );
  const missingPages = expectedPages.filter(
    (pageNumber) => !detectedPages.includes(pageNumber),
  );
  const outOfOrder = detectedPages.some(
    (pageNumber, index) =>
      index > 0 && pageNumber < detectedPages[index - 1],
  );
  const status: LoanEstimatePageSetStatus =
    detectedPages.length === 0
      ? 'UNVERIFIED'
      : duplicatePages.length > 0
        ? 'DUPLICATE'
        : outOfOrder
          ? 'OUT_OF_ORDER'
          : missingPages.length > 0
            ? 'PARTIAL'
            : 'COMPLETE';
  return {
    status,
    detectedPages,
    missingPages,
    duplicatePages,
    outOfOrder,
  };
}

function pageIntegrityWarnings(
  integrity: LoanEstimatePageIntegrity,
): string[] {
  const warnings: string[] = [];
  if (integrity.status === 'UNVERIFIED') {
    warnings.push(
      'Loan Estimate page check: Standard page 1–3 sections could not be verified. Confirm the document is an official Loan Estimate.',
    );
  }
  if (integrity.duplicatePages.length > 0) {
    warnings.push(
      `Loan Estimate page check: Duplicate page ${integrity.duplicatePages.join(', ')} detected. Replace duplicate images before relying on the comparison.`,
    );
  }
  if (integrity.outOfOrder) {
    warnings.push(
      'Loan Estimate page check: Pages appear out of order. Upload page images in page 1, 2, 3 order.',
    );
  }
  if (integrity.missingPages.length > 0 && integrity.status !== 'UNVERIFIED') {
    warnings.push(
      `Loan Estimate page check: Page ${integrity.missingPages.join(', ')} was not detected, so some comparison fields may be missing.`,
    );
  }
  return warnings;
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
  const pageIntegrity = analyzeLoanEstimatePageSet(
    detectLoanEstimatePages(text),
  );
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
      'This document does not appear to contain a usable text layer. OCR is required, and every populated value must be verified against the original.',
    );
  }
  if (requiredFieldsFound < requiredKeys.length) {
    warnings.push(
      `${requiredKeys.length - requiredFieldsFound} required comparison field(s) were not found and must be entered manually.`,
    );
  }
  warnings.push(...pageIntegrityWarnings(pageIntegrity));

  return {
    fields,
    extractedFieldCount,
    requiredFieldCount: requiredKeys.length,
    requiredFieldsFound,
    textLayerDetected,
    extractionMethod: 'PDF_TEXT',
    documentConfidencePct: null,
    pageCount: 1,
    pageIntegrity,
    reviewRequired: true,
    warnings,
  };
}

const EXTRACTION_CONFIDENCE_RANK: Record<
  LoanEstimateExtractionConfidence,
  number
> = {
  MISSING: 0,
  MEDIUM: 1,
  HIGH: 2,
};

const EXTRACTION_FIELD_LABELS: Record<
  keyof RefinanceLoanEstimateExtraction['fields'],
  string
> = {
  loanAmountUsd: 'loan amount',
  loanTermYears: 'loan term',
  loanType: 'loan type',
  noteRatePct: 'interest rate',
  aprPct: 'APR',
  monthlyPrincipalAndInterestUsd: 'monthly principal and interest',
  loanCostsUsd: 'total loan costs',
  lenderCreditsUsd: 'lender credits',
  cashToCloseUsd: 'cash to close',
  fiveYearTotalPaidUsd: 'five-year total paid',
  fiveYearPrincipalPaidUsd: 'five-year principal paid',
};

export function combineLoanEstimateExtractions(
  extractions: RefinanceLoanEstimateExtraction[],
): RefinanceLoanEstimateExtraction {
  if (extractions.length === 0) {
    throw new APIError(
      'At least one Loan Estimate page is required.',
      400,
      'LOAN_ESTIMATE_FILE_REQUIRED',
    );
  }
  if (extractions.length === 1) return extractions[0];

  const fieldKeys = Object.keys(extractions[0].fields) as Array<
    keyof RefinanceLoanEstimateExtraction['fields']
  >;
  const fields = Object.fromEntries(
    fieldKeys.map((key) => {
      let selected = extractions[0].fields[key];
      let selectedPage = 0;
      extractions.slice(1).forEach((extraction, offset) => {
        const candidate = extraction.fields[key];
        if (
          EXTRACTION_CONFIDENCE_RANK[candidate.confidence] >
          EXTRACTION_CONFIDENCE_RANK[selected.confidence]
        ) {
          selected = candidate as typeof selected;
          selectedPage = offset + 1;
        }
      });
      return [
        key,
        selected.value == null
          ? selected
          : {
              ...selected,
              sourceLabel: `${selected.sourceLabel} (page ${selectedPage + 1})`,
            },
      ];
    }),
  ) as unknown as RefinanceLoanEstimateExtraction['fields'];
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
  const confidences = extractions
    .map((extraction) => extraction.documentConfidencePct)
    .filter((value): value is number => value != null);
  const requiredFieldsFound = requiredKeys.filter(
    (key) => fields[key].value != null,
  ).length;
  const conflictingFields = fieldKeys.filter((key) => {
    const values = extractions
      .map((extraction) => extraction.fields[key].value)
      .filter((value) => value != null)
      .map(String);
    return new Set(values).size > 1;
  });
  const pageIntegrity = analyzeLoanEstimatePageSet(
    extractions.flatMap(
      (extraction) => extraction.pageIntegrity.detectedPages,
    ),
  );
  return {
    fields,
    extractedFieldCount: Object.values(fields).filter(
      (field) => field.value != null,
    ).length,
    requiredFieldCount: requiredKeys.length,
    requiredFieldsFound,
    textLayerDetected: extractions.every(
      (extraction) => extraction.textLayerDetected,
    ),
    extractionMethod: extractions.some(
      (extraction) => extraction.extractionMethod === 'PDF_OCR',
    )
      ? 'PDF_OCR'
      : extractions.some(
            (extraction) => extraction.extractionMethod === 'IMAGE_OCR',
          )
        ? 'IMAGE_OCR'
        : 'PDF_TEXT',
    documentConfidencePct:
      confidences.length === 0
        ? null
        : confidences.reduce((sum, value) => sum + value, 0) /
          confidences.length,
    pageCount: extractions.reduce(
      (sum, extraction) => sum + extraction.pageCount,
      0,
    ),
    pageIntegrity,
    reviewRequired: true,
    warnings: [
      ...new Set(
        extractions
          .flatMap((extraction) => extraction.warnings)
          .filter((warning) => !warning.startsWith('Loan Estimate page check:')),
      ),
      ...pageIntegrityWarnings(pageIntegrity),
      ...conflictingFields.map(
        (key) =>
          `Conflicting ${EXTRACTION_FIELD_LABELS[key]} values were found across the uploaded pages. The first highest-confidence value was retained; verify it against the document.`,
      ),
      `Values were merged from ${extractions.length} pages. Confirm that every page belongs to the same Loan Estimate revision.`,
    ],
  };
}

export function extractLoanEstimateFieldsFromOcrText(
  rawText: string,
  documentConfidencePct: number | null,
  extractionMethod: 'IMAGE_OCR' | 'PDF_OCR' = 'IMAGE_OCR',
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
      (warning) =>
        !/does not appear to contain a usable text layer|OCR is required/i.test(
          warning,
        ),
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
    extractionMethod,
    documentConfidencePct:
      documentConfidencePct == null
        ? null
        : Math.max(0, Math.min(100, documentConfidencePct)),
    pageCount: 1,
    warnings,
  };
}

export async function extractLoanEstimateFromPdf(
  buffer: Buffer,
): Promise<RefinanceLoanEstimateExtraction> {
  let parsed: { text?: string; numpages?: number };
  try {
    const pdfParse = require('pdf-parse');
    parsed = await pdfParse(buffer);
  } catch {
    throw new APIError(
      'The Loan Estimate PDF could not be read. Confirm that it is a valid, unencrypted PDF or enter the values manually.',
      422,
      'LOAN_ESTIMATE_PDF_UNREADABLE',
    );
  }

  const textExtraction = {
    ...extractLoanEstimateFieldsFromText(parsed.text ?? ''),
    pageCount:
      typeof parsed.numpages === 'number' && parsed.numpages > 0
        ? parsed.numpages
        : 1,
  };
  if (textExtraction.textLayerDetected) return textExtraction;

  try {
    return await extractLoanEstimateFromScannedPdf(buffer);
  } catch (error) {
    if (error instanceof APIError) throw error;
    throw new APIError(
      'The scanned Loan Estimate PDF could not be read with OCR. Try uploading up to three clear page images or enter the values manually.',
      422,
      'LOAN_ESTIMATE_PDF_OCR_UNREADABLE',
    );
  }
}

type LoanEstimateOcrWorker = {
  setParameters(parameters: Record<string, string>): Promise<unknown>;
  recognize(image: Buffer): Promise<{
    data?: { text?: string; confidence?: number };
  }>;
  terminate(): Promise<unknown>;
};

async function preprocessLoanEstimateImage(buffer: Buffer): Promise<Buffer> {
  try {
    const { default: sharp } = await import('sharp');
    return await sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: 2400, withoutEnlargement: false })
      .grayscale()
      .normalize()
      .sharpen({ sigma: 1 })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch {
    // Tesseract can read JPEG and PNG buffers directly. Image preprocessing
    // improves recognition but must not be a hard dependency.
    return buffer;
  }
}

async function createLoanEstimateOcrWorker(): Promise<LoanEstimateOcrWorker> {
  const { createWorker } = await import('tesseract.js');
  const language = require('@tesseract.js-data/eng') as {
    code: string;
    gzip: boolean;
    langPath: string;
  };
  const worker = (await createWorker(language.code, 1, {
    langPath: language.langPath,
    gzip: language.gzip,
    cacheMethod: 'none',
  })) as LoanEstimateOcrWorker;
  await worker.setParameters({
    tessedit_pageseg_mode: '6',
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
  });
  return worker;
}

async function recognizeLoanEstimatePage(
  worker: LoanEstimateOcrWorker,
  buffer: Buffer,
  extractionMethod: 'IMAGE_OCR' | 'PDF_OCR',
): Promise<RefinanceLoanEstimateExtraction> {
  const result = await worker.recognize(
    await preprocessLoanEstimateImage(buffer),
  );
  return extractLoanEstimateFieldsFromOcrText(
    String(result?.data?.text ?? ''),
    typeof result?.data?.confidence === 'number'
      ? result.data.confidence
      : null,
    extractionMethod,
  );
}

type PdfImageDocument = {
  length: number;
  getPage(pageNumber: number): Promise<Buffer>;
  destroy(): Promise<void>;
};

const importEsmModule = new Function(
  'specifier',
  'return import(specifier)',
) as (specifier: string) => Promise<{
  pdf(
    input: Buffer,
    options: { scale: number },
  ): Promise<PdfImageDocument>;
}>;

export async function extractLoanEstimateFromScannedPdf(
  buffer: Buffer,
): Promise<RefinanceLoanEstimateExtraction> {
  const { pdf } = await importEsmModule('pdf-to-img');
  const document = await pdf(buffer, { scale: 2.5 });
  try {
    if (document.length > 3) {
      throw new APIError(
        'Scanned Loan Estimate PDFs are limited to three pages. Upload the official three-page Loan Estimate or up to three page images.',
        422,
        'LOAN_ESTIMATE_PDF_PAGE_LIMIT',
      );
    }
    const worker = await createLoanEstimateOcrWorker();
    try {
      const pageExtractions: RefinanceLoanEstimateExtraction[] = [];
      for (let pageNumber = 1; pageNumber <= document.length; pageNumber += 1) {
        pageExtractions.push(
          await recognizeLoanEstimatePage(
            worker,
            await document.getPage(pageNumber),
            'PDF_OCR',
          ),
        );
      }
      const extraction = combineLoanEstimateExtractions(pageExtractions);
      return {
        ...extraction,
        extractionMethod: 'PDF_OCR',
        pageCount: document.length,
        warnings: [
          ...extraction.warnings,
          'This scanned PDF was rendered and read with OCR. Verify every populated value against the original Loan Estimate.',
        ],
      };
    } finally {
      await worker.terminate();
    }
  } finally {
    await document.destroy();
  }
}

export async function extractLoanEstimateFromImage(
  buffer: Buffer,
): Promise<RefinanceLoanEstimateExtraction> {
  let worker: LoanEstimateOcrWorker | null = null;
  try {
    worker = await createLoanEstimateOcrWorker();
    return await recognizeLoanEstimatePage(worker, buffer, 'IMAGE_OCR');
  } catch (error) {
    if (error instanceof APIError) throw error;
    throw new APIError(
      'The Loan Estimate image could not be read. Try a clear PNG, JPEG, or WEBP image or enter the values manually.',
      422,
      'LOAN_ESTIMATE_IMAGE_UNREADABLE',
    );
  } finally {
    if (worker) await worker.terminate();
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
