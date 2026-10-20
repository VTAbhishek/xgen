<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Category extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'tracks_imei'];

    protected function casts(): array
    {
        return ['tracks_imei' => 'boolean'];
    }

    public function items(): HasMany
    {
        return $this->hasMany(Item::class);
    }
}
