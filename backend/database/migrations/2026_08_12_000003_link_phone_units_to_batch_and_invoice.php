<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Give each handset the two links selling it needs.
     *
     * `batch_id` is the cost-batch the phone arrived in. A line can hold phones
     * from several GRNs, so the batch to draw down cannot be read off the
     * invoice line — it belongs to the individual handset.
     *
     * `invoice_id` is what lets a cancelled or edited invoice hand its phones
     * back without having to re-read the lines.
     */
    public function up(): void
    {
        Schema::table('phone_units', function (Blueprint $table) {
            $table->foreignId('batch_id')->nullable()->after('grn_line_id')
                ->constrained('item_batches')->nullOnDelete();
            $table->foreignId('invoice_id')->nullable()->after('batch_id')
                ->constrained()->nullOnDelete();
            $table->foreignId('invoice_line_id')->nullable()->after('invoice_id')
                ->constrained('invoice_lines')->nullOnDelete();
            $table->index(['invoice_id']);
        });
    }

    public function down(): void
    {
        Schema::table('phone_units', function (Blueprint $table) {
            $table->dropForeign(['batch_id']);
            $table->dropForeign(['invoice_id']);
            $table->dropForeign(['invoice_line_id']);
            $table->dropIndex(['invoice_id']);
            $table->dropColumn(['batch_id', 'invoice_id', 'invoice_line_id']);
        });
    }
};
