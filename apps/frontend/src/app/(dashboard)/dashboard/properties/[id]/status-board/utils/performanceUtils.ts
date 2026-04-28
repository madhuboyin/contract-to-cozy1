/**
 * Performance optimization utilities for Status Board
 */

/**
 * Debounce function to limit how often a function can be called.
 * 
 * Useful for search input to avoid excessive filtering operations.
 * 
 * @param func - Function to debounce
 * @param delay - Delay in milliseconds (default: 300ms)
 * @returns Debounced function
 * 
 * @example
 * const debouncedSearch = debounce((value: string) => {
 *   setSearch(value);
 * }, 300);
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number = 300
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;

  return function debounced(...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func(...args);
    }, delay);
  };
}

/**
 * Check if virtualization should be enabled based on item count.
 * 
 * Virtualization is recommended when displaying more than 100 items
 * to maintain smooth scrolling performance.
 * 
 * @param itemCount - Number of items to display
 * @returns True if virtualization should be enabled
 * 
 * @example
 * if (shouldVirtualize(items.length)) {
 *   // Use react-window or similar
 * }
 */
export function shouldVirtualize(itemCount: number): boolean {
  return itemCount > 100;
}

/**
 * Throttle function to limit execution rate.
 * 
 * Unlike debounce, throttle ensures the function is called at most
 * once per specified time period.
 * 
 * @param func - Function to throttle
 * @param limit - Time limit in milliseconds
 * @returns Throttled function
 * 
 * @example
 * const throttledScroll = throttle(() => {
 *   handleScroll();
 * }, 100);
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return function throttled(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}
