import React, { useState } from 'react';
import { X, Check, Loader2 } from 'lucide-react';

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

export default function PricingModal({ isOpen, onClose, userId }: PricingModalProps) {
  const [isAnnual, setIsAnnual] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const monthlyVariantId = import.meta.env.VITE_LEMON_SQUEEZY_MONTHLY_VARIANT_ID || 'monthly_variant_id';
  const annualVariantId = import.meta.env.VITE_LEMON_SQUEEZY_ANNUAL_VARIANT_ID || 'annual_variant_id';

  const handleSubscribe = async () => {
    setIsLoading(true);
    try {
      const variantId = isAnnual ? annualVariantId : monthlyVariantId;
      
      if (variantId === 'monthly_variant_id' || variantId === 'annual_variant_id') {
        throw new Error('Please configure VITE_LEMON_SQUEEZY_MONTHLY_VARIANT_ID and VITE_LEMON_SQUEEZY_ANNUAL_VARIANT_ID in your environment variables.');
      }

      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId
        },
        body: JSON.stringify({ variantId })
      });

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Failed to initiate checkout');
      }
    } catch (error: any) {
      console.error('Checkout error:', error);
      alert(error.message || 'Failed to start checkout process. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden relative animate-in fade-in zoom-in-95 duration-200">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-zinc-900 mb-2">Unlock Unlimited Words</h2>
            <p className="text-zinc-500">Bypass the 100-word limit and humanize long-form content instantly.</p>
          </div>

          <div className="flex items-center justify-center gap-3 mb-8">
            <span className={`text-sm font-medium ${!isAnnual ? 'text-zinc-900' : 'text-zinc-500'}`}>Monthly</span>
            <button 
              onClick={() => setIsAnnual(!isAnnual)}
              className="relative inline-flex h-6 w-11 items-center rounded-full bg-zinc-200 transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2"
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isAnnual ? 'translate-x-6 bg-zinc-900' : 'translate-x-1'}`} />
            </button>
            <span className={`text-sm font-medium ${isAnnual ? 'text-zinc-900' : 'text-zinc-500'}`}>
              Annually <span className="text-emerald-600 text-xs bg-emerald-50 px-2 py-0.5 rounded-full ml-1">Save 20%</span>
            </span>
          </div>

          <div className="bg-zinc-50 rounded-2xl p-6 border border-zinc-200 mb-8">
            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-4xl font-bold text-zinc-900">${isAnnual ? '24' : '2'}</span>
              <span className="text-zinc-500 font-medium">/ {isAnnual ? 'year' : 'month'}</span>
            </div>

            <ul className="space-y-4">
              {[
                'Unlimited word count per request',
                'Priority API processing',
                'Zero AI detection guarantee',
                'Cancel anytime'
              ].map((feature, i) => (
                <li key={i} className="flex items-center gap-3 text-zinc-700">
                  <div className="bg-emerald-100 p-1 rounded-full">
                    <Check className="w-3 h-3 text-emerald-600" />
                  </div>
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          <button
            onClick={handleSubscribe}
            disabled={isLoading}
            className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-semibold py-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {isLoading ? 'Processing...' : `Subscribe for $${isAnnual ? '24/yr' : '2/mo'}`}
          </button>
          
          <p className="text-center text-xs text-zinc-400 mt-4">
            Secure payment processed by Lemon Squeezy.
          </p>
        </div>
      </div>
    </div>
  );
}
