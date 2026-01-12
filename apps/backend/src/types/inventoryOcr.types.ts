// apps/backend/src/types/inventoryOcr.types.ts
export type OcrField = {
    value: string | null;
    confidence: number; // 0..1
    source: 'OCR' | 'AI' | 'USER';
  };
  
  export type InventoryLabelOcrExtracted = {
    manufacturer?: OcrField;
    modelNumber?: OcrField;
    serialNumber?: OcrField;
    upc?: OcrField;
    sku?: OcrField;
    name?: OcrField;
    categoryHint?: OcrField;
  };
  
  export type InventoryLabelOcrResult = {
    provider: string;
    rawText?: string;
    rawJson?: any;
    extracted: InventoryLabelOcrExtracted;
  };
  