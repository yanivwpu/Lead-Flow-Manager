import { getUncachableStripeClient } from './stripeClient';

async function createSubscriptionProducts() {
  const stripe = await getUncachableStripeClient();

  console.log('Creating subscription products in Stripe...');

  // Check if products already exist
  const existingProducts = await stripe.products.search({ query: "name:'WhaChatCRM'" });
  if (existingProducts.data.length > 0) {
    console.log('Products already exist. Skipping creation.');
    return;
  }

  // Create Starter Plan
  const starterProduct = await stripe.products.create({
    name: 'WhaChatCRM Starter',
    description: 'For solo founders & small businesses. 500 conversations/month, full messaging, email notifications.',
    metadata: {
      plan: 'starter',
      conversationsPerMonth: '500',
      maxUsers: '3',
      maxWhatsappNumbers: '1',
    },
  });

  const starterPrice = await stripe.prices.create({
    product: starterProduct.id,
    unit_amount: 1900, // $19.00
    currency: 'usd',
    recurring: { interval: 'month' },
    metadata: { plan: 'starter' },
  });

  console.log(`Created Starter: ${starterProduct.id}, Price: ${starterPrice.id}`);

  // Create Growth Plan
  const growthProduct = await stripe.products.create({
    name: 'WhaChatCRM Growth',
    description: 'For growing teams. 2,000 conversations/month, up to 3 users, push + email reminders.',
    metadata: {
      plan: 'growth',
      conversationsPerMonth: '2000',
      maxUsers: '3',
      maxWhatsappNumbers: '1',
    },
  });

  const growthPrice = await stripe.prices.create({
    product: growthProduct.id,
    unit_amount: 4900, // $49.00
    currency: 'usd',
    recurring: { interval: 'month' },
    metadata: { plan: 'growth' },
  });

  console.log(`Created Growth: ${growthProduct.id}, Price: ${growthPrice.id}`);

  // Create Pro Plan
  const proProduct = await stripe.products.create({
    name: 'WhaChatCRM Pro',
    description: 'For high-volume teams. 2,000 conversations/month, 10 users, 3 WhatsApp numbers, team inbox.',
    metadata: {
      plan: 'pro',
      conversationsPerMonth: '2000',
      maxUsers: '10',
      maxWhatsappNumbers: '3',
    },
  });

  const proPrice = await stripe.prices.create({
    product: proProduct.id,
    unit_amount: 9900, // $99.00
    currency: 'usd',
    recurring: { interval: 'month' },
    metadata: { plan: 'pro' },
  });

  console.log(`Created Pro: ${proProduct.id}, Price: ${proPrice.id}`);

  console.log('All products created successfully!');
}

createSubscriptionProducts().catch(console.error);
