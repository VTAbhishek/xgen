<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            // Categories of serialised goods — phones, tablets, laptops. Items in
            // one are received a unit at a time, each with its own IMEI.
            $table->boolean('tracks_imei')->default(false)->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->dropColumn('tracks_imei');
        });
    }
};
