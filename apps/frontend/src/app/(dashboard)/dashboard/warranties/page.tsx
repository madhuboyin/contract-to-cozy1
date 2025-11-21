// apps/frontend/src/app/(dashboard)/dashboard/warranties/page.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { FileText, Plus, Loader2, Wrench, Trash2, Edit, X, Save, Upload, ExternalLink } from 'lucide-react';
import { format, parseISO, isPast } from 'date-fns';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Warranty, CreateWarrantyInput, UpdateWarrantyInput, Property, APIResponse } from '@/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

// --- Warranty Form Component ---
interface WarrantyFormProps {
  initialData?: Warranty;
  properties: Property[];
  onSave: (data: CreateWarrantyInput | UpdateWarrantyInput) => Promise<void>;
  onClose: () => void;
  isSubmitting: boolean;
}

const WarrantyForm = ({ initialData, properties, onSave, onClose, isSubmitting }: WarrantyFormProps) => {
  const [formData, setFormData] = useState<CreateWarrantyInput | UpdateWarrantyInput>({
    providerName: initialData?.providerName || '',
    policyNumber: initialData?.policyNumber || '',
    coverageDetails: initialData?.coverageDetails || '',
    cost: initialData?.cost || undefined,
    startDate: initialData?.startDate ? format(parseISO(initialData.startDate), 'yyyy-MM-dd') : '',
    expiryDate: initialData?.expiryDate ? format(parseISO(initialData.expiryDate), 'yyyy-MM-dd') : '',
    propertyId: initialData?.propertyId || undefined,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [id]: id === 'cost' ? (value ? parseFloat(value) : undefined) : value,
    }));
  };

  const handleSelectChange = (value: string) => {
    setFormData(prev => ({ ...prev, propertyId: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData as CreateWarrantyInput | UpdateWarrantyInput);
  };

  const title = initialData ? `Edit Warranty: ${initialData.providerName}` : 'Add New Warranty';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-xl font-semibold mb-4">{title}</h2>
      
      <div className="grid gap-2">
        <Label htmlFor="providerName">Provider Name *</Label>
        <Input id="providerName" value={formData.providerName} onChange={handleChange} required />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="policyNumber">Policy Number</Label>
          <Input id="policyNumber" value={formData.policyNumber} onChange={handleChange} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cost">Cost ($)</Label>
          <Input id="cost" type="number" step="0.01" value={formData.cost ?? ''} onChange={handleChange} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="startDate">Start Date *</Label>
          <Input id="startDate" type="date" value={formData.startDate} onChange={handleChange} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="expiryDate">Expiry Date *</Label>
          <Input id="expiryDate" type="date" value={formData.expiryDate} onChange={handleChange} required />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="propertyId">Associated Property</Label>
        <Select 
          value={formData.propertyId || ''} 
          onValueChange={handleSelectChange}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a property (Optional)" />
          </SelectTrigger>
          <SelectContent>
            {properties.map(p => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} ({p.zipCode})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="coverageDetails">Coverage Details</Label>
        <Textarea id="coverageDetails" value={formData.coverageDetails} onChange={handleChange} rows={3} />
      </div>

      <DialogFooter className="mt-6">
        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
          <X className="w-4 h-4 mr-2" /> Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} 
          {initialData ? 'Save Changes' : 'Create Warranty'}
        </Button>
      </DialogFooter>
    </form>
  );
};

// --- Documents View Component ---
const DocumentsView = ({ documents }: { documents: Warranty['documents'] }) => {
  if (!documents || documents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">No documents associated with this warranty.</p>
    );
  }
  return (
    <ul className="space-y-2">
      {documents.map(doc => (
        <li key={doc.id} className="flex items-center justify-between p-2 border rounded-md">
          <div className="flex items-center">
            <FileText className="w-4 h-4 mr-2 text-blue-500" />
            <span className="text-sm font-medium truncate">{doc.name}</span>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs">
              View <ExternalLink className="w-3 h-3 ml-1" />
            </a>
          </Button>
        </li>
      ))}
    </ul>
  );
};


// --- Main Page Component ---
export default function WarrantiesPage() {
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWarranty, setEditingWarranty] = useState<Warranty | undefined>(undefined);
  const { toast } = useToast();

  const fetchDependencies = async () => {
    const [warrantiesRes, propertiesRes] = await Promise.all([
      api.listWarranties(),
      api.getProperties(),
    ]);

    if (warrantiesRes.success) {
      setWarranties(warrantiesRes.data.warranties);
    } else {
      toast({
        title: "Error fetching warranties",
        description: warrantiesRes.message,
        variant: "destructive",
      });
    }

    if (propertiesRes.success) {
      setProperties(propertiesRes.data.properties);
    }
  };

  useEffect(() => {
    fetchDependencies().finally(() => setIsLoading(false));
  }, []);

  const handleSave = async (data: CreateWarrantyInput | UpdateWarrantyInput) => {
    setIsSubmitting(true);
    let res: APIResponse<Warranty>;
    
    if (editingWarranty) {
      res = await api.updateWarranty(editingWarranty.id, data as UpdateWarrantyInput);
    } else {
      res = await api.createWarranty(data as CreateWarrantyInput);
    }

    if (res.success) {
      toast({
        title: editingWarranty ? 'Warranty Updated' : 'Warranty Created',
        description: `${res.data.providerName}'s policy was saved successfully.`,
      });
      await fetchDependencies(); // Refresh list
      setIsModalOpen(false);
      setEditingWarranty(undefined);
    } else {
      toast({
        title: 'Operation Failed',
        description: res.message,
        variant: 'destructive',
      });
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (warrantyId: string) => {
    if (!window.confirm("Are you sure you want to delete this warranty? This cannot be undone.")) {
      return;
    }

    setIsLoading(true);
    const res = await api.deleteWarranty(warrantyId);

    if (res.success) {
      toast({ title: 'Warranty Deleted', description: 'The warranty record was removed.' });
      await fetchDependencies();
    } else {
      toast({ title: 'Deletion Failed', description: res.message, variant: 'destructive' });
    }
    setIsLoading(false);
  };
  
  const openEditModal = (warranty: Warranty) => {
    setEditingWarranty(warranty);
    setIsModalOpen(true);
  };
  
  const closeModal = () => {
    setIsModalOpen(false);
    setEditingWarranty(undefined);
  };

  const sortedWarranties = useMemo(() => {
    return [...warranties].sort((a, b) => {
        const dateA = parseISO(a.expiryDate).getTime();
        const dateB = parseISO(b.expiryDate).getTime();
        return dateA - dateB;
    });
  }, [warranties]);

  return (
    <div className="space-y-6 pb-8">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Wrench className="w-7 h-7 text-blue-600" /> My Home Warranties
        </h2>
        <Dialog open={isModalOpen} onOpenChange={closeModal}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingWarranty(undefined); setIsModalOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" /> Add Warranty
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <WarrantyForm 
              initialData={editingWarranty}
              properties={properties}
              onSave={handleSave}
              onClose={closeModal}
              isSubmitting={isSubmitting}
            />
          </DialogContent>
        </Dialog>
      </div>
      <p className="text-muted-foreground">Track all service, appliance, and home warranties in one place. Never miss an expiration date.</p>

      {isLoading && (
        <div className="text-center py-10">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
          <p className="text-gray-500 mt-2">Loading warranties...</p>
        </div>
      )}

      {!isLoading && sortedWarranties.length === 0 && (
        <Card className="text-center py-10">
          <FileText className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <CardTitle>No Warranties Found</CardTitle>
          <CardDescription>Click "Add Warranty" to create your first record.</CardDescription>
        </Card>
      )}

      {!isLoading && sortedWarranties.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedWarranties.map(warranty => {
            const isExpired = isPast(parseISO(warranty.expiryDate));
            const property = properties.find(p => p.id === warranty.propertyId);
            
            return (
              <Card 
                key={warranty.id} 
                className={cn(
                  "flex flex-col",
                  isExpired ? "border-red-400 bg-red-50/50" : "border-gray-200"
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <CardTitle 
                      className={cn(
                        "text-lg",
                        isExpired && "text-red-700"
                      )}
                    >
                      {warranty.providerName}
                    </CardTitle>
                    <div className="text-xs font-semibold px-2 py-1 rounded-full text-white"
                      style={{ backgroundColor: isExpired ? 'rgb(220 38 38)' : 'rgb(37 99 235)' }}
                    >
                      {isExpired ? 'EXPIRED' : format(parseISO(warranty.expiryDate), 'MMM dd, yyyy')}
                    </div>
                  </div>
                  <CardDescription>
                    Policy: {warranty.policyNumber || 'N/A'} 
                    {property && ` | Property: ${property.name || property.address}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 space-y-3 pt-3 text-sm">
                    <p className="text-gray-600 line-clamp-2">{warranty.coverageDetails || 'No detailed coverage summary provided.'}</p>
                    <p className="font-medium text-gray-700">Cost: {warranty.cost ? `$${warranty.cost.toFixed(2)}` : 'N/A'}</p>
                    <div className="border-t pt-3">
                        <h4 className="font-semibold text-xs mb-2 flex items-center gap-1 text-gray-600">
                            <Upload className="w-3 h-3" /> Documents ({warranty.documents.length})
                        </h4>
                        <DocumentsView documents={warranty.documents} />
                    </div>
                </CardContent>
                <Dialog open={editingWarranty?.id === warranty.id && isModalOpen} onOpenChange={closeModal}>
                  <DialogTrigger asChild>
                    <div className="flex border-t">
                      <Button variant="ghost" className="w-1/2 rounded-none rounded-bl-lg text-blue-600" onClick={() => openEditModal(warranty)}>
                        <Edit className="w-4 h-4 mr-2" /> Edit
                      </Button>
                      <Button variant="ghost" className="w-1/2 rounded-none rounded-br-lg text-red-600 hover:bg-red-50" onClick={() => handleDelete(warranty.id)}>
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </Button>
                    </div>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[500px]">
                    {editingWarranty?.id === warranty.id && (
                       <WarrantyForm 
                          initialData={editingWarranty}
                          properties={properties}
                          onSave={handleSave}
                          onClose={closeModal}
                          isSubmitting={isSubmitting}
                        />
                    )}
                  </DialogContent>
                </Dialog>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}