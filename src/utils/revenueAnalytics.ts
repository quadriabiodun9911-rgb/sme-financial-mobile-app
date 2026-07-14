import { Transaction, Invoice } from '../types';

export interface RevenueMetrics {
  totalRevenue: number;
  thisMonthRevenue: number;
  lastMonthRevenue: number;
  monthOverMonthGrowth: number;
  averageMonthlyRevenue: number;
  totalProfit: number;
  thisMonthProfit: number;
  lastMonthProfit: number;
  profitMargin: number;
  topCategories: CategoryRevenue[];
  topProducts: ProductRevenue[];
}

export interface CategoryRevenue {
  category: string;
  revenue: number;
  profit: number;
  margin: number;
  count: number;
  trend: number; // % change vs last month
}

export interface ProductRevenue {
  name: string;
  revenue: number;
  profit: number;
  margin: number;
  count: number;
}

export interface SalesFunnel {
  leads: number;
  prospects: number;
  customers: number;
  paidCustomers: number;
  conversionRate: number; // prospects to paid
  avgOrderValue: number;
}

export class RevenueAnalytics {
  private transactions: Transaction[];
  private invoices: Invoice[];
  private thisMonth: string;
  private lastMonth: string;

  constructor(transactions: Transaction[], invoices: Invoice[], thisMonth: string, lastMonth: string) {
    this.transactions = transactions;
    this.invoices = invoices;
    this.thisMonth = thisMonth;
    this.lastMonth = lastMonth;
  }

  /**
   * Calculate comprehensive revenue metrics
   */
  public getRevenueMetrics(): RevenueMetrics {
    const thisMonthRevenue = this.getMonthlyRevenue(this.thisMonth);
    const lastMonthRevenue = this.getMonthlyRevenue(this.lastMonth);
    const thisMonthProfit = this.getMonthlyProfit(this.thisMonth);
    const lastMonthProfit = this.getMonthlyProfit(this.lastMonth);

    const totalRevenue = this.transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalProfit = totalRevenue - this.getTotalExpenses();

    const monthOverMonthGrowth =
      lastMonthRevenue > 0
        ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
        : 0;

    const averageMonthlyRevenue = this.getAverageMonthlyRevenue();

    return {
      totalRevenue,
      thisMonthRevenue,
      lastMonthRevenue,
      monthOverMonthGrowth,
      averageMonthlyRevenue,
      totalProfit,
      thisMonthProfit,
      lastMonthProfit,
      profitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
      topCategories: this.getTopCategories(),
      topProducts: this.getTopProducts(),
    };
  }

  /**
   * Estimate sales funnel metrics
   */
  public getSalesFunnel(): SalesFunnel {
    const uniqueCustomers = new Set(
      this.transactions
        .filter(t => t.type === 'income' && t.vendorCustomer)
        .map(t => t.vendorCustomer)
    ).size;

    const paidCustomers = new Set(
      this.invoices
        .filter(i => i.status === 'paid')
        .map(i => i.clientName)
    ).size;

    const totalInvoices = this.invoices.filter(i => i.status !== 'draft').length;
    const invoiceCustomers = new Set(this.invoices.map(i => i.clientName)).size;

    const totalRevenue = this.transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const transactionCount = this.transactions.filter(t => t.type === 'income').length;
    const avgOrderValue = transactionCount > 0 ? totalRevenue / transactionCount : 0;

    // Estimate funnel
    const leads = Math.max(uniqueCustomers * 2.5, invoiceCustomers); // Estimate leads
    const prospects = invoiceCustomers;
    const customers = uniqueCustomers;
    const paid = paidCustomers;

    return {
      leads: Math.round(leads),
      prospects: prospects,
      customers: customers,
      paidCustomers: paid,
      conversionRate:
        prospects > 0 ? (paid / prospects) * 100 : 0,
      avgOrderValue,
    };
  }

  /**
   * Get top revenue-generating categories
   */
  private getTopCategories(): CategoryRevenue[] {
    const categoryMap: Record<string, { revenue: number; expense: number; count: number }> = {};

    // Sum by category
    this.transactions.forEach(t => {
      const cat = t.category || 'Other';
      if (!categoryMap[cat]) {
        categoryMap[cat] = { revenue: 0, expense: 0, count: 0 };
      }

      if (t.type === 'income') {
        categoryMap[cat].revenue += t.amount;
        categoryMap[cat].count += 1;
      } else if (t.type === 'expense') {
        categoryMap[cat].expense += t.amount;
      }
    });

    // Calculate metrics and sort
    const categories = Object.entries(categoryMap)
      .filter(([_, data]) => data.revenue > 0) // Only income categories
      .map(([cat, data]) => ({
        category: cat,
        revenue: data.revenue,
        profit: data.revenue - data.expense,
        margin: data.revenue > 0 ? ((data.revenue - data.expense) / data.revenue) * 100 : 0,
        count: data.count,
        trend: 0, // TODO: Calculate trend vs last month
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return categories.slice(0, 5); // Top 5
  }

  /**
   * Get top products/services based on transaction descriptions
   */
  private getTopProducts(): ProductRevenue[] {
    const productMap: Record<string, { revenue: number; profit: number; count: number }> = {};

    this.transactions
      .filter(t => t.type === 'income' && t.description)
      .forEach(t => {
        const desc = t.description || 'Unnamed';
        if (!productMap[desc]) {
          productMap[desc] = { revenue: 0, profit: 0, count: 0 };
        }

        productMap[desc].revenue += t.amount;
        productMap[desc].count += 1;
      });

    // Calculate profit (rough estimate: 40% of revenue as profit)
    Object.values(productMap).forEach(p => {
      p.profit = p.revenue * 0.4;
    });

    const products = Object.entries(productMap)
      .map(([name, data]) => ({
        name,
        revenue: data.revenue,
        profit: data.profit,
        margin: (data.profit / data.revenue) * 100,
        count: data.count,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return products.slice(0, 5); // Top 5
  }

  /**
   * Get monthly revenue
   */
  private getMonthlyRevenue(monthKey: string): number {
    return this.transactions
      .filter(t => t.type === 'income' && t.date.startsWith(monthKey))
      .reduce((sum, t) => sum + t.amount, 0);
  }

  /**
   * Get monthly profit
   */
  private getMonthlyProfit(monthKey: string): number {
    const revenue = this.getMonthlyRevenue(monthKey);
    const expenses = this.transactions
      .filter(t => t.type === 'expense' && t.date.startsWith(monthKey))
      .reduce((sum, t) => sum + t.amount, 0);
    return revenue - expenses;
  }

  /**
   * Get total expenses
   */
  private getTotalExpenses(): number {
    return this.transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
  }

  /**
   * Get average monthly revenue
   */
  private getAverageMonthlyRevenue(): number {
    const months = new Set(
      this.transactions
        .filter(t => t.type === 'income')
        .map(t => t.date.slice(0, 7))
    );

    if (months.size === 0) return 0;

    const totalRevenue = this.transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    return totalRevenue / months.size;
  }

  /**
   * Get revenue trend
   */
  public getRevenueTrend(months: number = 12): { month: string; revenue: number }[] {
    const trend: Record<string, number> = {};

    this.transactions
      .filter(t => t.type === 'income')
      .forEach(t => {
        const monthKey = t.date.slice(0, 7);
        trend[monthKey] = (trend[monthKey] || 0) + t.amount;
      });

    return Object.entries(trend)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-months)
      .map(([month, revenue]) => ({ month, revenue }));
  }

  /**
   * Get profit trend
   */
  public getProfitTrend(months: number = 12): { month: string; profit: number }[] {
    const trend: Record<string, { revenue: number; expense: number }> = {};

    this.transactions.forEach(t => {
      const monthKey = t.date.slice(0, 7);
      if (!trend[monthKey]) trend[monthKey] = { revenue: 0, expense: 0 };

      if (t.type === 'income') {
        trend[monthKey].revenue += t.amount;
      } else {
        trend[monthKey].expense += t.amount;
      }
    });

    return Object.entries(trend)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-months)
      .map(([month, data]) => ({ month, profit: data.revenue - data.expense }));
  }
}

/**
 * Public API
 */
export const analyzeRevenue = (
  transactions: Transaction[],
  invoices: Invoice[],
  thisMonth: string,
  lastMonth: string
): RevenueMetrics => {
  const analyzer = new RevenueAnalytics(transactions, invoices, thisMonth, lastMonth);
  return analyzer.getRevenueMetrics();
};

export const analyzeSalesFunnel = (
  transactions: Transaction[],
  invoices: Invoice[]
): SalesFunnel => {
  const analyzer = new RevenueAnalytics(transactions, invoices, '', '');
  return analyzer.getSalesFunnel();
};
