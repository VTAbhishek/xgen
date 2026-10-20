<?php

namespace App\Http\Controllers;

use App\Models\PhoneUnit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PhoneUnitController extends Controller
{
    /**
     * Handsets still on the shelf, for the IMEI box on an invoice line.
     *
     * The operator either scans a barcode — which arrives as the whole IMEI at
     * once — or types the last few digits off the sticker, so the search matches
     * anywhere in the number rather than only at the start.
     */
    public function available(Request $request): JsonResponse
    {
        $q = trim((string) $request->input('q'));
        $itemId = (int) $request->input('item_id');

        $units = PhoneUnit::query()
            ->where('status', 'in_stock')
            ->when($itemId, fn ($qb) => $qb->where('item_id', $itemId))
            ->when($q !== '', fn ($qb) => $qb->where('imei', 'like', "%{$q}%"))
            ->with('item:id,code,name')
            ->orderBy('imei')
            ->limit(50)
            ->get(['id', 'item_id', 'imei', 'colour', 'storage', 'battery', 'cost', 'batch_id']);

        return response()->json(['data' => $units]);
    }

    /**
     * One handset by exact IMEI, whatever its state — the barcode on the back of
     * a phone someone brings in, looked up without knowing the item first.
     */
    public function lookup(Request $request): JsonResponse
    {
        $imei = trim((string) $request->input('imei'));

        $unit = PhoneUnit::query()
            ->where('imei', $imei)
            ->with(['item:id,code,name', 'grn:id,no,date'])
            ->first();

        abort_if(! $unit, 404, "No handset recorded with IMEI {$imei}.");

        return response()->json(['data' => $unit]);
    }
}
