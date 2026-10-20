<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * One row per physical handset received on a GRN.
     *
     * A serialised item's stock is the count of its units, so each phone is a
     * record in its own right rather than a blob on the GRN line: the IMEI has
     * to be unique shop-wide, and scanning a barcode at billing time has to find
     * exactly one handset.
     */
    public function up(): void
    {
        Schema::create('phone_units', function (Blueprint $table) {
            $table->id();
            $table->foreignId('item_id')->constrained()->cascadeOnDelete();
            $table->foreignId('grn_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('grn_line_id')->nullable()->constrained('grn_lines')->nullOnDelete();
            $table->string('imei', 32)->unique();
            $table->string('colour', 60)->nullable();
            $table->string('storage', 30)->nullable();
            $table->unsignedTinyInteger('battery')->nullable(); // health %, 0-100
            $table->decimal('cost', 12, 2)->default(0);         // unit cost off the GRN line
            $table->string('status', 20)->default('in_stock');  // in_stock | sold
            $table->timestamps();

            $table->index(['item_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('phone_units');
    }
};
