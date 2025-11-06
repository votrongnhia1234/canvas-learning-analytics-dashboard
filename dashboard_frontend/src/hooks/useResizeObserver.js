import { useCallback, useLayoutEffect, useRef, useState } from "react";

export default function useResizeObserver() {
  const ref = useRef(null);
  const [bounds, setBounds] = useState(null);

  const measure = useCallback(() => {
    if (ref.current) {
      const { width, height } = ref.current.getBoundingClientRect();
      setBounds({
        width: Math.max(width, 100),
        height: Math.max(height, 100)
      });
    }
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const resizeObserver = new ResizeObserver(() => measure());
    resizeObserver.observe(ref.current);
    return () => resizeObserver.disconnect();
  }, [measure]);

  return [ref, bounds];
}
