<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreInvoiceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'type' => ['required', 'in:cash,credit'],
            'customer_id' => ['required', 'exists:customers,id'],
            'cash_discount' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'cheque_discount' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'credit_discount' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'return_credit' => ['nullable', 'numeric', 'min:0'],
            'tax_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'paid' => ['nullable', 'numeric', 'min:0'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'exists:items,id'],
            'lines.*.batch_id' => ['nullable', 'exists:item_batches,id'],
            'lines.*.qty' => ['required', 'numeric', 'min:0.01'],
            'lines.*.price' => ['required', 'numeric', 'min:0'],
            // Serialised items are sold by picking handsets; the count of these
            // is the line quantity and each one carries its own cost-batch.
            'lines.*.unit_ids' => ['nullable', 'array'],
            'lines.*.unit_ids.*' => ['integer', 'exists:phone_units,id'],
            'cheques' => ['nullable', 'array'],
            'cheques.*.no' => ['nullable', 'string', 'max:60'],
            'cheques.*.date' => ['nullable', 'date'],
            'cheques.*.amount' => ['nullable', 'numeric', 'min:0'],
        ];
    }
}
