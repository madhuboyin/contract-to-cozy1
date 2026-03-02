// apps/frontend/src/app/(dashboard)/dashboard/expenses/page.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DollarSign, Plus, Loader2, Trash2, Edit, X, Save, Filter } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Expense, CreateExpenseInput, UpdateExpenseInput, Property, ExpenseCategory, APIError, APIResponse } from '@/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import DateField from '@/components/shared/DateField';

// Helper for Expense Category mapping (for display)
const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  REPAIR_SERVICE: 'Repair/Service',
  PROPERTY_TAX: 'Property Tax',
  HOA_FEE: 'HOA Fee',
  UTILITY: 'Utility Bill',
  APPLIANCE: 'Appliance',
  MATERIALS: 'Materials/Supplies',
  OTHER: 'Other',
};

// --- CONSTANT FOR CLEAR SELECT VALUE ---
const SELECT_NONE_VALUE = '__NONE__';
const SELECT_ALL_VALUE = '__ALL__';

// --- Expense Form Component (Simplified for brevity, assuming no changes needed here) ---
interface ExpenseFormProps {
  initialData?: Expense;
  properties: Property[];
  onSave: (data: CreateExpenseInput | UpdateExpenseInput) => Promise<void>;
  onClose: () => void;
  isSubmitting: boolean;
}

const ExpenseForm = ({ initialData, properties, onSave, onClose, isSubmitting }: ExpenseFormProps) => {
  const [formData, setFormData] = useState<CreateExpenseInput | UpdateExpenseInput>({
    description: initialData?.description || '',
    category: initialData?.category || 'REPAIR_SERVICE',
    amount: initialData?.amount || 0,
    transactionDate: initialData?.transactionDate ? format(parseISO(initialData.transactionDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
    propertyId: initialData?.propertyId || undefined,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [id]: id === 'amount' ? (Number(value) || 0) : value,
    }));
  };

  const handleSelectChange = (key: keyof (CreateExpenseInput), value: string) => {
    setFormData(prev => ({ 
      ...prev, 
      [key]: value === SELECT_NONE_VALUE ? undefined : value // Map placeholder back to undefined/null
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData as CreateExpenseInput | UpdateExpenseInput);
  };

  const title = initialData ? `Edit Expense: ${initialData.description}` : 'Add New Expense';

  // Determine the selected value for the property dropdown
  const selectedPropertyId = formData.propertyId || SELECT_NONE_VALUE; 


  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <h2 className="text-xl font-semibold">{title}</h2>
      </DialogHeader>
      
      <div className="grid gap-2">
        <Label htmlFor="description">Description *</Label>
        <Input id="description" value={formData.description} onChange={handleChange} required />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="amount">Amount ($) *</Label>
          <Input id="amount" type="number" step="0.01" value={formData.amount ?? ''} onChange={handleChange} required />
        </div>
        <DateField
          id="transactionDate"
          label="Transaction Date *"
          value={formData.transactionDate}
          onChange={(value) => setFormData((prev) => ({ ...prev, transactionDate: value }))}
          required
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="category">Category *</Label>
          <Select 
            value={formData.category} 
            onValueChange={(v) => handleSelectChange('category', v as ExpenseCategory)}
            required
          >
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(EXPENSE_CATEGORY_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="propertyId">Associated Property</Label>
          <Select 
            value={selectedPropertyId} // Use local variable for controlled state
            onValueChange={(v) => handleSelectChange('propertyId', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a property (Optional)" />
            </SelectTrigger>
            <SelectContent>
              {/* FIX: Use a non-empty string placeholder */}
              <SelectItem value={SELECT_NONE_VALUE}>
                None (General Expense)
              </SelectItem> 
              {properties.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} ({p.zipCode})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <DialogFooter className="mt-6">
        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
          <X className="w-4 h-4 mr-2" /> Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} 
          {initialData ? 'Save Changes' : 'Record Expense'}
        </Button>
      </DialogFooter>
    </form>
  );
};

// --- Main Page Component ---
export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  // Use SELECT_ALL_VALUE to represent no filter (all properties)
  const [filterPropertyId, setFilterPropertyId] = useState<string>(SELECT_ALL_VALUE); 
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | undefined>(undefined);
  const { toast } = useToast();

  // CRITICAL FIX: Wrap in useCallback and ensure it handles the full fetch cycle
  const fetchDependencies = useCallback(async () => {
    setIsLoading(true); // Always set loading true before fetching
    const apiPropertyId = filterPropertyId === SELECT_ALL_VALUE ? undefined : filterPropertyId;
    
    const [expensesRes, propertiesRes] = await Promise.all([
      api.listExpenses(apiPropertyId), 
      api.getProperties(),
    ]);

    if (expensesRes.success) {
      setExpenses(expensesRes.data.expenses);
    } else {
      toast({
        title: "Error fetching expenses",
        description: expensesRes.message,
        variant: "destructive",
      });
      setExpenses([]); // Ensure state is cleared on API failure
    }

    if (propertiesRes.success) {
      setProperties(propertiesRes.data.properties);
    }
    
    setIsLoading(false); // Set loading false only after processing all results
  }, [filterPropertyId, toast]); // Depend on filterPropertyId

  useEffect(() => {
    fetchDependencies();
  }, [fetchDependencies]); // Depend on memoized fetch function

  const handleSave = async (data: CreateExpenseInput | UpdateExpenseInput) => {
    setIsSubmitting(true);
    let res: APIResponse<Expense>;
    
    if (editingExpense) {
      res = await api.updateExpense(editingExpense.id, data as UpdateExpenseInput);
    } else {
      res = await api.createExpense(data as CreateExpenseInput);
    }

    if (res.success) {
      toast({
        title: editingExpense ? 'Expense Updated' : 'Expense Recorded',
        description: `Expense for $${res.data.amount.toFixed(2)} was saved successfully.`,
      });
      // FIX: Ensure the list refresh is triggered right after a successful save.
      await fetchDependencies(); 
      setIsModalOpen(false);
      setEditingExpense(undefined);
    } else {
      // FIX: Remove unnecessary cast to APIError
      toast({
        title: 'Operation Failed',
        description: res.message,
        variant: 'destructive',
      });
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (expenseId: string) => {
    if (!window.confirm("Are you sure you want to delete this expense record? This cannot be undone.")) {
      return;
    }

    setIsLoading(true);
    const res = await api.deleteExpense(expenseId);

    if (res.success) {
      toast({ title: 'Expense Deleted', description: 'The expense record was removed.' });
      // FIX: Ensure the list refresh is triggered right after a successful delete.
      await fetchDependencies();
    } else {
      // FIX: Remove unnecessary cast to APIError
      toast({ title: 'Deletion Failed', description: res.message, variant: 'destructive' });
    }
    // Note: setIsLoading(false) is handled inside fetchDependencies now
  };
  
  // Update signature to accept Expense | undefined
  const openEditModal = (expense?: Expense) => {
    setEditingExpense(expense);
    setIsModalOpen(true);
  };
  
  const closeModal = () => {
    setIsModalOpen(false);
    setEditingExpense(undefined);
  };

  const sortedExpenses = useMemo(() => {
    // Rely on expenses state being correctly updated by fetchDependencies
    return [...expenses].sort((a, b) => {
        const dateA = parseISO(a.transactionDate).getTime();
        const dateB = parseISO(b.transactionDate).getTime();
        return dateB - dateA; // Sort descending by date
    });
  }, [expenses]);

  const totalSpent = useMemo(() => {
    return expenses.reduce((sum, expense) => sum + expense.amount, 0);
  }, [expenses]);
  
  const getPropertyDisplay = (propertyId: string | null) => {
      const property = properties.find(p => p.id === propertyId);
      return property ? property.name || property.address : 'Unassigned';
  };


  return (
    <div className="space-y-6 pb-8">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <DollarSign className="w-7 h-7 text-indigo-600" /> Expense Tracker
        </h2>
        <div className="flex items-center gap-4">
          <Dialog open={isModalOpen} onOpenChange={closeModal}>
            {/* FIX: Button directly opens the controlled dialog */}
            <Button onClick={() => openEditModal(undefined)}>
              <Plus className="w-4 h-4 mr-2" /> Add Expense
            </Button>
            <DialogContent className="sm:max-w-[500px]">
              <ExpenseForm 
                initialData={editingExpense}
                properties={properties}
                onSave={handleSave}
                onClose={closeModal}
                isSubmitting={isSubmitting}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <p className="text-muted-foreground">Track non-platform costs like property taxes, materials, and utility bills for accurate home budgeting.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
                <Filter className="w-4 h-4 text-gray-500"/> Filter Expenses
            </CardTitle>
            <p className="text-xs text-muted-foreground">Applies to list below</p>
          </CardHeader>
          <CardContent>
             <Select 
                value={filterPropertyId} 
                onValueChange={setFilterPropertyId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Filter by Property" />
                </SelectTrigger>
                <SelectContent>
                    {/* FIX: Use SELECT_ALL_VALUE instead of "" */}
                    <SelectItem value={SELECT_ALL_VALUE}>All Expenses</SelectItem> 
                    {properties.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.zipCode})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
          </CardContent>
        </Card>
        <Card className="bg-indigo-50 border-indigo-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-indigo-800">Total Spent</CardTitle>
            <DollarSign className="h-4 w-4 text-indigo-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-900">
              {isLoading ? '...' : `$${totalSpent.toFixed(2)}`}
            </div>
            <p className="text-xs text-indigo-600">
              {filterPropertyId === SELECT_ALL_VALUE ? `across all properties` : `for this property`}
            </p>
          </CardContent>
        </Card>
      </div>


      {/* FIX: Display No Data/Loading only after checking isLoading */}
      {isLoading && (
        <div className="text-center py-10">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />
          <p className="text-gray-500 mt-2">Loading expenses...</p>
        </div>
      )}

      {/* FIX: Check if NOT loading AND length is 0 */}
      {!isLoading && sortedExpenses.length === 0 && (
        <Card className="text-center py-10">
          <DollarSign className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <CardTitle>No Expenses Found</CardTitle>
          <CardDescription>Click &quot;Add Expense&quot; to create your first record.</CardDescription>
        </Card>
      )}

      {!isLoading && sortedExpenses.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">Property</th>
                  <th className="relative px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedExpenses.map(expense => (
                  <tr key={expense.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {format(parseISO(expense.transactionDate), 'MMM dd, yyyy')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 truncate max-w-xs">{expense.description}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {EXPENSE_CATEGORY_LABELS[expense.category]}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-right text-indigo-700">
                      ${expense.amount.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden sm:table-cell">
                      {getPropertyDisplay(expense.propertyId)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700" onClick={() => openEditModal(expense)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => handleDelete(expense.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
