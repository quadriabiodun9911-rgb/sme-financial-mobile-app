import { NextFunction, Request, Response } from 'express';

export interface AuditLogEntry {
    timestamp: string;
    method: string;
    path: string;
    businessId: string | null;
    statusCode: number;
}

// Every data-access request is logged, per the CBN Open Banking Operational
// Guidelines' audit-log requirement. In production this writes to a durable,
// tamper-evident store (e.g. an append-only table or the data lake) instead
// of process memory.
export const auditLogEntries: AuditLogEntry[] = [];

export function auditLog(req: Request, res: Response, next: NextFunction) {
    res.on('finish', () => {
        auditLogEntries.push({
            timestamp: new Date().toISOString(),
            method: req.method,
            path: req.originalUrl,
            businessId: (req.header('x-business-id') as string) || null,
            statusCode: res.statusCode,
        });
    });
    next();
}
