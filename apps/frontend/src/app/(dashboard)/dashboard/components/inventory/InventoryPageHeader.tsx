'use client';

import React from 'react';
import {
  ChevronDown,
  Download,
  Grid,
  History,
  Package,
  Plus,
  Upload,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type InventoryPageHeaderProps = {
  activeTab: 'items' | 'coverage';
  onTabChange: (tab: 'items' | 'coverage') => void;
  onManageRooms: () => void;
  onExportCsv: () => void;
  onBulkUpload: () => void;
  onImportHistory: () => void;
  onAddItem: () => void;
};

export default function InventoryPageHeader({
  activeTab,
  onTabChange,
  onManageRooms,
  onExportCsv,
  onBulkUpload,
  onImportHistory,
  onAddItem,
}: InventoryPageHeaderProps) {
  return (
    <div className="mb-6">
      <div className="mb-1 flex items-center gap-3">
        <div className="rounded-xl border border-teal-100 bg-teal-50 p-2">
          <Package className="h-5 w-5 text-teal-600" />
        </div>

        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900">Home Inventory</h1>
          <p className="text-sm text-gray-500">
            Track appliances, systems, and valuables with receipts and replacement values.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => onTabChange('items')}
            className={[
              'rounded-md px-4 py-1.5 text-sm font-medium transition-all',
              activeTab === 'items' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            Items
          </button>
          <button
            type="button"
            onClick={() => onTabChange('coverage')}
            className={[
              'rounded-md px-4 py-1.5 text-sm font-medium transition-all',
              activeTab === 'coverage' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            Coverage
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 md:flex">
            <button
              type="button"
              onClick={onManageRooms}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-800"
            >
              <Grid className="h-3.5 w-3.5" />
              Manage rooms
            </button>

            <button
              type="button"
              onClick={onExportCsv}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-800"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-800"
                >
                  More
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onBulkUpload}>
                  <Upload className="mr-2 h-3.5 w-3.5" />
                  Bulk upload
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onImportHistory}>
                  <History className="mr-2 h-3.5 w-3.5" />
                  Import history
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-800 md:hidden"
              >
                More
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onManageRooms}>
                <Grid className="mr-2 h-3.5 w-3.5" />
                Manage rooms
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExportCsv}>
                <Download className="mr-2 h-3.5 w-3.5" />
                Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onBulkUpload}>
                <Upload className="mr-2 h-3.5 w-3.5" />
                Bulk upload
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onImportHistory}>
                <History className="mr-2 h-3.5 w-3.5" />
                Import history
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            onClick={onAddItem}
            className="flex items-center gap-2 rounded-lg border border-teal-500 bg-teal-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm shadow-teal-600/20 transition-colors hover:bg-teal-700"
          >
            <Plus className="h-4 w-4" />
            Add item
          </button>
        </div>
      </div>
    </div>
  );
}
