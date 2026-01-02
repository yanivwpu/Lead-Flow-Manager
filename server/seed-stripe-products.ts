// Stripe Products Seed Script
// Run with: npx tsx server/seed-stripe-products.ts

import { getUncachableStripeClient } from './stripeClient';

async function seedProducts() {
  console.log('Creating Stripe products and prices...');
  
  const stripe = await getUncachableStripeClient();

  // Check if products already exist
  const existingProducts = await stripe.products.list({ limit: 100 });
  const starterExists = existingProducts.data.find(p => p.name === 'Starter Plan');
  const proExists = existingProducts.data.find(p => p.name === 'Pro Plan');

  if (starterExists && proExists) {
    console.log('Products already exist. Skipping creation.');
    console.log('Starter:', starterExists.id);
    console.log('Pro:', proExists.id);
    return;
  }

  // Create Starter Plan ($19/month)
  if (!starterExists) {
    const starterProduct = await stripe.products.create({
      name: 'Starter Plan',
      description: 'WhachatCRM Starter - 3 users, 1 WhatsApp number, 1,000 conversations/month, $5 Twilio usage included',
      metadata: {
        plan: 'starter',
        maxUsers: '3',
        maxWhatsappNumbers: '1',
        conversationsPerMonth: '1000',
        twilioUsageIncluded: '5',
      },
    });

    const starterPrice = await stripe.prices.create({
      product: starterProduct.id,
      unit_amount: 1900, // $19.00
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: {
        plan: 'starter',
      },
    });

    console.log('Created Starter Plan:');
    console.log('  Product ID:', starterProduct.id);
    console.log('  Price ID:', starterPrice.id);
  }

  // Create Pro Plan ($49/month)
  if (!proExists) {
    const proProduct = await stripe.products.create({
      name: 'Pro Plan',
      description: 'WhachatCRM Pro - 10 users, 3 WhatsApp numbers, 5,000 conversations/month, $15 Twilio usage included',
      metadata: {
        plan: 'pro',
        maxUsers: '10',
        maxWhatsappNumbers: '3',
        conversationsPerMonth: '5000',
        twilioUsageIncluded: '15',
      },
    });

    const proPrice = await stripe.prices.create({
      product: proProduct.id,
      unit_amount: 4900, // $49.00
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: {
        plan: 'pro',
      },
    });

    console.log('Created Pro Plan:');
    console.log('  Product ID:', proProduct.id);
    console.log('  Price ID:', proPrice.id);
  }

  console.log('\nDone! Products created in Stripe.');
  console.log('The webhook will automatically sync them to your database.');
}

seedProducts().catch(console.error);
