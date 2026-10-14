export function validSellingPrice(value: unknown): boolean;
export function productStartingPrice(product?: { price?: unknown; display_price?: unknown; models?: unknown[]; colors?: unknown[]; specs?: { price?: unknown }[]; skus?: { price_fen?: unknown; is_on_sale?: unknown }[] }): number | null;
export function startingPriceText(value: number | null): string;
