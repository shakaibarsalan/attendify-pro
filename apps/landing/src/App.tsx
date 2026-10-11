import React from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import HowItWorks from './components/HowItWorks';
import Features from './components/Features';
import Benefits from './components/Benefits';
import Security from './components/Security';
import Pricing from './components/Pricing';
import FAQ from './components/FAQ';
import CTASection from './components/CTASection';
import ContactSection from './components/ContactSection';
import Footer from './components/Footer';
import Chatbot from './components/Chatbot';

export default function App() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <Benefits />
        <Security />
        <Pricing />
        <FAQ />
        <CTASection />
        <ContactSection />
      </main>
      <Footer />
      <Chatbot />
    </>
  );
}
