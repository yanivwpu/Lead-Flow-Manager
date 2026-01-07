import { getUncachableStripeClient } from '../server/stripeClient';

async function seedProducts() {
  console.log('Creating Stripe products and prices...');
  
  const stripe = await getUncachableStripeClient();

  // Check if products already exist
  const existingProducts = await stripe.products.list({ limit: 10 });
  if (existingProducts.data.length > 0) {
    console.log('Products already exist:', existingProducts.data.map(p => p.name).join(', '));
    return;
  }

  // Create Starter Plan
  const starterProduct = await stripe.products.create({
    name: 'Starter Plan',
    description: 'Perfect for small businesses - 500 conversations/month',
    metadata: {
      plan: 'starter',
      conversationsLimit: '500',
    },
  });

  const starterPrice = await stripe.prices.create({
    product: starterProduct.id,
    unit_amount: 1900, // $19.00
    currency: 'usd',
    recurring: { interval: 'month' },
  });

  console.log(`Created Starter Plan: ${starterProduct.id} with price ${starterPrice.id} ($19/month)`);

  // Create Pro Plan
  const proProduct = await stripe.products.create({
    name: 'Pro Plan',
    description: 'For growing teams - 2000 conversations/month with workflows',
    metadata: {
      plan: 'pro',
      conversationsLimit: '2000',
    },
  });

  const proPrice = await stripe.prices.create({
    product: proProduct.id,
    unit_amount: 4900, // $49.00
    currency: 'usd',
    recurring: { interval: 'month' },
  });

  console.log(`Created Pro Plan: ${proProduct.id} with price ${proPrice.id} ($49/month)`);

  console.log('\nDone! Products are created in Stripe. Restart the app to sync them to the database.');
}

seedProducts()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error creating products:', err);
    process.exit(1);
  });
