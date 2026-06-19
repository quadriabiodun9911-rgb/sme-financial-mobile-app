import { useState, useMemo } from 'react';

export function usePagination<T>(items: T[], pageSize = 50) {
    const [page, setPage] = useState(1);
    const visible = useMemo(() => items.slice(0, page * pageSize), [items, page, pageSize]);
    const loadMore = () => {
        if (visible.length < items.length) setPage(p => p + 1);
    };
    const reset = () => setPage(1);
    return { visible, loadMore, reset, hasMore: visible.length < items.length };
}
