<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InvoiceLine extends Model
{
    protected $fillable = ['invoice_id', 'item_id', 'batch_id', 'name', 'qty', 'price', 'total'];

    protected $casts = [
        // PHP < 8.1 returns numeric DB columns as strings; keep ids integers.
        'invoice_id' => 'integer',
        'item_id' => 'integer',
        'batch_id' => 'integer',
        'qty' => 'decimal:2',
        'price' => 'decimal:2',
        'total' => 'decimal:2',
    ];

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    /** The individual handsets sold on this line, for serialised items. */
    public function units(): HasMany
    {
        return $this->hasMany(PhoneUnit::class, 'invoice_line_id');
    }
}
