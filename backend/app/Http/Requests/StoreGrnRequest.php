<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreGrnRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'type' => ['required', 'in:cash,credit'],
            'supplier_id' => ['required', 'exists:suppliers,id'],
            'tax_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'paid' => ['nullable', 'numeric', 'min:0'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'exists:items,id'],
            'lines.*.qty' => ['required', 'numeric', 'min:0.01'],
            'lines.*.unit_price' => ['required', 'numeric', 'min:0'],
            'lines.*.discount' => ['nullable', 'numeric', 'min:0', 'max:100'],
            // Serialised goods (categories flagged tracks_imei) are received one
            // handset at a time; the unit count then drives the line qty.
            'lines.*.units' => ['nullable', 'array'],
            'lines.*.units.*.imei' => ['required', 'string', 'regex:/^[0-9]{6,20}$/'],
            'lines.*.units.*.colour' => ['nullable', 'string', 'max:60'],
            'lines.*.units.*.storage' => ['nullable', 'string', 'max:30'],
            'lines.*.units.*.battery' => ['nullable', 'integer', 'min:0', 'max:100'],
            // Customer-returned goods being handed back on this GRN.
            'return_lines' => ['nullable', 'array'],
            'return_lines.*.sales_return_line_id' => ['required', 'integer', 'exists:sales_return_lines,id'],
            'return_lines.*.qty' => ['required', 'integer', 'min:1'],
            'cheques' => ['nullable', 'array'],
            'cheques.*.no' => ['nullable', 'string', 'max:60'],
            'cheques.*.date' => ['nullable', 'date'],
            'cheques.*.amount' => ['nullable', 'numeric', 'min:0'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'lines.*.units.*.imei.required' => 'Every phone needs an IMEI.',
            'lines.*.units.*.imei.regex' => 'An IMEI must be 6 to 20 digits, numbers only.',
            'lines.*.units.*.battery.max' => 'Battery health is a percentage, so it cannot go above 100.',
        ];
    }
}
