// Script to update existing Stripe products with new conversation limits
// Run with: npx tsx server/update-stripe-products.ts

import { getUncachableStripeClient } from './stripeClient';

async function updateProducts() {
  console.log('Updating Stripe products with new conversation limits...\n');
  
  const stripe = await getUncachableStripeClient();

  // Find existing products
  const products = await stripe.products.list({ limit: 100, active: true });
  
  const starterProduct = products.data.find(p => 
    p.name === 'Starter Plan' || p.name === 'WhaChatCRM Starter'
  );
  const proProduct = products.data.find(p => 
    p.name === 'Pro Plan' || p.name === 'WhaChatCRM Pro'
  );

  if (starterProduct) {
    console.log(`Found Starter Plan: ${starterProduct.id}`);
    console.log(`  Current description: ${starterProduct.description}`);
    
    await stripe.products.update(starterProduct.id, {
      description: 'WhachatCRM Starter - 3 users, 1 WhatsApp number, 100 conversations/month, $5 Twilio usage included',
      metadata: {
        ...starterProduct.metadata,
        conversationsPerMonth: '100',
        maxUsers: '3',
        maxWhatsappNumbers: '1',
      },
    });
    
    console.log('  ✓ Updated to 100 conversations/month\n');
  } else {
    console.log('⚠ Starter Plan not found\n');
  }

  if (proProduct) {
    console.log(`Found Pro Plan: ${proProduct.id}`);
    console.log(`  Current description: ${proProduct.description}`);
    
    await stripe.products.update(proProduct.id, {
      description: 'WhachatCRM Pro - 10 users, 3 WhatsApp numbers, 500 conversations/month, $15 Twilio usage included',
      metadata: {
        ...proProduct.metadata,
        conversationsPerMonth: '500',
        maxUsers: '10',
        maxWhatsappNumbers: '3',
      },
    });
    
    console.log('  ✓ Updated to 500 conversations/month\n');
  } else {
    console.log('⚠ Pro Plan not found\n');
  }

  console.log('Done! Stripe products updated.');
}

updateProducts().catch(console.error);
