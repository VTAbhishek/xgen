<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PhoneUnit extends Model
{
    use HasFactory;

    protected $fillable = [
        'item_id', 'grn_id', 'grn_line_id', 'batch_id', 'invoice_id', 'imei',
        'colour', 'storage', 'battery', 'cost', 'status',
    ];

    protected function casts(): array
    {
        return [
            'battery' => 'integer',
            'cost' => 'decimal:2',
        ];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function grn(): BelongsTo
    {
        return $this->belongsTo(Grn::class);
    }
}
