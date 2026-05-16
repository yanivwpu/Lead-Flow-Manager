"use client"

import { ArrowLeft, Check, Home, MessageCircle, Bot, Calendar, ClipboardList, Users, Filter, Target, Clock, FileText, Sparkles, ChevronRight, Send, Paperclip, Smile, Phone, Video, MoreVertical, Star, Tag, Bell, Settings, Search, Plus, Zap, ArrowRight, CheckCircle2, AlertCircle, Timer, UserCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"

export default function RealtorGrowthEnginePage() {
  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-50">
        <Link href="#" className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span className="font-medium">Growth Engines</span>
        </Link>
        <Link href="#" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <ChevronRight className="h-4 w-4 rotate-180" />
          Back to Growth Engines
        </Link>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {/* Hero Section - Premium with depth */}
        <section className="relative bg-gradient-to-br from-[#0a1f17] via-[#0f2920] to-[#143d2e] rounded-3xl p-8 md:p-10 text-white overflow-hidden mb-6 shadow-2xl">
          {/* Ambient glow effects */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-72 h-72 bg-teal-500/10 rounded-full blur-3xl" />
          
          {/* Subtle glass overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent" />
          
          {/* Grid pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px]" />

          <div className="relative">
            {/* Badge & Icons Row */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/10 shadow-lg shadow-black/10">
                  <Home className="h-5 w-5 text-emerald-300" />
                </div>
                <div className="bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/10 shadow-lg shadow-black/10">
                  <MessageCircle className="h-5 w-5 text-emerald-300" />
                </div>
                <div className="bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/10 shadow-lg shadow-black/10">
                  <Bot className="h-5 w-5 text-emerald-300" />
                </div>
              </div>
              <Badge className="bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 border border-emerald-400/30 backdrop-blur-md px-4 py-1.5 font-medium shadow-lg">
                Premium Growth Engine
              </Badge>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-3 tracking-tight">Realtor Growth Engine</h1>
            <p className="text-xl md:text-2xl text-emerald-100/90 mb-2 font-medium">AI-powered WhatsApp automation for real estate</p>
            <p className="text-gray-300/80 text-base">Convert inquiries into qualified buyers & booked showings — automatically.</p>
          </div>
        </section>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-4 md:gap-6 mb-8">
          {[
            { step: 1, label: "Activate", active: true },
            { step: 2, label: "Setup", active: false },
            { step: 3, label: "Go Live", active: false },
          ].map((item, index) => (
            <div key={item.step} className="flex items-center gap-4">
              <div className="flex flex-col items-center gap-1.5">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                  item.active 
                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30" 
                    : "bg-white border-2 border-gray-200 text-gray-400"
                }`}>
                  {item.step}
                </div>
                <span className={`text-xs font-medium ${item.active ? "text-emerald-600" : "text-gray-400"}`}>
                  {item.label}
                </span>
              </div>
              {index < 2 && (
                <div className={`w-12 md:w-16 h-0.5 ${index === 0 ? "bg-gradient-to-r from-emerald-600 to-gray-200" : "bg-gray-200"} -mt-5`} />
              )}
            </div>
          ))}
        </div>

        {/* What it does */}
        <section className="bg-white rounded-2xl p-6 md:p-8 mb-6 border border-gray-200/80 shadow-sm">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-1">What it does</h2>
          <p className="text-gray-500 text-sm mb-6">
            A coordinated automation engine that runs alongside your inbox and CRM — built for real estate speed-to-lead.
          </p>

          <div className="grid lg:grid-cols-2 gap-8">
            <div className="space-y-3">
              {[
                "Captures new real estate leads the moment they message you.",
                "Replies instantly on WhatsApp with context-aware conversations.",
                "Qualifies buyers and sellers using structured signals (financing, budget, timeline).",
                "Detects booking intent and moves the thread toward a showing or call.",
                "Schedules showings or calls when your calendar is connected.",
                "Follows up automatically when leads go cold on 24h / 72h / 7d cadence.",
                "Updates CRM stage, score, tags, and next step so your pipeline stays honest.",
              ].map((item, index) => (
                <div key={index} className="flex items-start gap-3 group">
                  <div className="mt-0.5 flex-shrink-0">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
                      <Check className="h-3 w-3 text-emerald-600" />
                    </div>
                  </div>
                  <span className="text-gray-600 text-sm leading-relaxed">{item}</span>
                </div>
              ))}
            </div>

            {/* Premium WhatsApp Mockup */}
            <div className="relative flex justify-center lg:justify-end">
              <div className="relative">
                <div className="bg-gradient-to-b from-gray-200 to-gray-100 rounded-[2.5rem] p-2.5 w-[280px] shadow-2xl">
                  {/* Phone Frame */}
                  <div className="bg-white rounded-[2rem] overflow-hidden shadow-inner">
                    {/* WhatsApp Header */}
                    <div className="bg-[#075e54] px-3 py-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <ArrowLeft className="h-4 w-4 text-white/80" />
                          <div className="relative">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-md">
                              <span className="text-white text-xs font-bold">SM</span>
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-[#075e54]" />
                          </div>
                          <div>
                            <p className="text-white font-semibold text-xs">Sarah Mitchell</p>
                            <p className="text-emerald-200 text-[10px] flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                              online
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Video className="h-4 w-4 text-white/80" />
                          <Phone className="h-4 w-4 text-white/80" />
                          <MoreVertical className="h-4 w-4 text-white/80" />
                        </div>
                      </div>
                    </div>

                    {/* AI Copilot Banner */}
                    <div className="bg-gradient-to-r from-emerald-50 to-teal-50 px-3 py-1.5 border-b border-emerald-100">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                          <Sparkles className="h-2.5 w-2.5 text-white" />
                        </div>
                        <span className="text-[10px] text-emerald-700 font-medium">AI Copilot Active</span>
                        <Badge className="ml-auto text-[8px] bg-emerald-100 text-emerald-700 border-0 py-0 px-1.5">New Lead</Badge>
                      </div>
                    </div>

                    {/* Chat Area */}
                    <div className="bg-[#efeae2] p-3 space-y-2 min-h-[260px]">
                      {/* Time stamp */}
                      <div className="flex justify-center">
                        <span className="bg-white/80 text-gray-500 text-[9px] px-2.5 py-0.5 rounded-full shadow-sm">Today</span>
                      </div>

                      {/* Incoming Message */}
                      <div className="flex justify-start">
                        <div className="bg-white rounded-xl rounded-tl-sm px-3 py-2 max-w-[85%] shadow-sm">
                          <p className="text-[11px] text-gray-800 leading-relaxed">Hi! I&apos;m looking for a 3 bedroom house in Miami.</p>
                          <span className="text-[9px] text-gray-400 float-right mt-0.5 ml-2">10:24 AM</span>
                        </div>
                      </div>

                      {/* Outgoing Message with AI Badge */}
                      <div className="flex justify-end">
                        <div className="bg-[#d9fdd3] rounded-xl rounded-tr-sm px-3 py-2 max-w-[85%] shadow-sm relative">
                          <div className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center shadow-md">
                            <Sparkles className="h-2 w-2 text-white" />
                          </div>
                          <p className="text-[11px] text-gray-800 leading-relaxed">Great! I can help you find the perfect home. What&apos;s your budget range?</p>
                          <div className="flex items-center justify-end gap-1 mt-0.5">
                            <span className="text-[9px] text-gray-500">10:24 AM</span>
                            <CheckCircle2 className="h-2.5 w-2.5 text-blue-500" />
                          </div>
                        </div>
                      </div>

                      {/* Incoming Message */}
                      <div className="flex justify-start">
                        <div className="bg-white rounded-xl rounded-tl-sm px-3 py-2 max-w-[85%] shadow-sm">
                          <p className="text-[11px] text-gray-800 leading-relaxed">Around $600k - $800k</p>
                          <span className="text-[9px] text-gray-400 float-right mt-0.5 ml-2">10:25 AM</span>
                        </div>
                      </div>

                      {/* Outgoing with Booking Intent */}
                      <div className="flex justify-end">
                        <div className="bg-[#d9fdd3] rounded-xl rounded-tr-sm px-3 py-2 max-w-[85%] shadow-sm relative">
                          <div className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center shadow-md">
                            <Sparkles className="h-2 w-2 text-white" />
                          </div>
                          <p className="text-[11px] text-gray-800 leading-relaxed">Perfect! I have 3 great options in Coral Gables.</p>
                          <div className="mt-1.5 bg-emerald-600 text-white text-[10px] px-2.5 py-1.5 rounded-lg flex items-center justify-center gap-1.5 font-medium">
                            <Calendar className="h-3 w-3" />
                            Schedule Showing
                          </div>
                          <div className="flex items-center justify-end gap-1 mt-1">
                            <span className="text-[9px] text-gray-500">10:25 AM</span>
                            <CheckCircle2 className="h-2.5 w-2.5 text-blue-500" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Input Area */}
                    <div className="bg-[#f0f0f0] px-2 py-1.5 flex items-center gap-2">
                      <Smile className="h-5 w-5 text-gray-500" />
                      <div className="flex-1 bg-white rounded-full px-3 py-1.5 text-[11px] text-gray-400 shadow-sm">
                        Type a message
                      </div>
                      <Paperclip className="h-4 w-4 text-gray-500" />
                      <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-md">
                        <Send className="h-3.5 w-3.5 text-white ml-0.5" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Lead Score Floating Card */}
                <div className="absolute -right-2 lg:-right-6 top-16 bg-white rounded-xl p-3 shadow-xl border border-gray-100 w-40">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <Target className="h-3.5 w-3.5 text-emerald-600" />
                    </div>
                    <span className="text-[10px] font-semibold text-gray-700">Lead Score</span>
                  </div>
                  <div className="flex items-end gap-1.5">
                    <span className="text-2xl font-bold text-emerald-600">87</span>
                    <span className="text-[10px] text-gray-400 mb-1">/100</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1 mt-1.5">
                    <div className="bg-emerald-500 h-1 rounded-full" style={{ width: '87%' }} />
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-1.5 text-[9px]">
                      <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                      <span className="text-gray-600">Budget qualified</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px]">
                      <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                      <span className="text-gray-600">Timeline: 2 months</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px]">
                      <AlertCircle className="h-2.5 w-2.5 text-amber-500" />
                      <span className="text-gray-600">Financing TBD</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* What's included */}
        <section className="bg-white rounded-2xl p-6 md:p-8 mb-6 border border-gray-200/80 shadow-sm">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-1">What&apos;s included</h2>
          <p className="text-gray-500 text-sm mb-6">Everything installed as a system — not a loose pile of message templates.</p>

          <div className="grid md:grid-cols-3 gap-4">
            {[
              { icon: Bot, title: "AI lead qualification", description: "Understands messages, asks the right questions, and scores leads." },
              { icon: Target, title: "Buyer / seller scoring", description: "Intent and readiness scoring updates automatically as the thread evolves." },
              { icon: Calendar, title: "Booking intent detection", description: "Detects showing or call intent and starts the booking flow." },
              { icon: Clock, title: "No-reply nurture sequence", description: "Smart follow-ups re-engage leads without manual chasing." },
              { icon: FileText, title: "WhatsApp template follow-up", description: "Structured sends when the 24h window closes (uses approved templates)." },
              { icon: ClipboardList, title: "Pipeline stages & tags", description: "Stages, tags, and scores stay aligned with automation outcomes." },
              { icon: Sparkles, title: "Tasks & follow-up creation", description: "Next steps and reminders are created automatically for your team." },
              { icon: Users, title: "Concierge launch session", description: "White-glove validation session before you go live at real scale." },
            ].map((feature, index) => (
              <div key={index} className="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group cursor-default">
                <div className="p-2 rounded-lg flex-shrink-0 transition-colors bg-gray-100 text-gray-600 group-hover:bg-emerald-50 group-hover:text-emerald-600">
                  <feature.icon className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm mb-0.5">{feature.title}</h3>
                  <p className="text-gray-500 text-xs leading-relaxed">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Automation architecture */}
        <section className="bg-white rounded-2xl p-6 md:p-8 mb-6 border border-gray-200/80 shadow-sm">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-1">Automation architecture</h2>
          <p className="text-gray-500 text-sm mb-6">How messages, intent, AI, and CRM updates connect in this engine.</p>

          {/* Flow Diagram - Responsive, no scroll */}
          <div className="relative bg-gray-50 rounded-xl p-4 md:p-6 border border-gray-200">
            {/* Desktop: Horizontal Flow */}
            <div className="hidden lg:flex items-center justify-between gap-2">
              {/* Node 1 - Trigger */}
              <div className="flex-1 max-w-[100px]">
                <div className="bg-white rounded-xl p-2.5 shadow-sm border border-gray-200">
                  <div className="w-7 h-7 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center mb-1.5 mx-auto">
                    <MessageCircle className="h-3.5 w-3.5 text-gray-600" />
                  </div>
                  <p className="text-[10px] font-semibold text-gray-800 text-center">New inquiry</p>
                </div>
              </div>

              <ArrowRight className="h-4 w-4 text-gray-300 flex-shrink-0" />

              {/* Node 2 - AI Response */}
              <div className="flex-1 max-w-[100px]">
                <div className="bg-white rounded-xl p-2.5 shadow-sm border border-gray-200">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center mb-1.5 mx-auto">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                  </div>
                  <p className="text-[10px] font-semibold text-gray-800 text-center">AI reply</p>
                </div>
              </div>

              <ArrowRight className="h-4 w-4 text-gray-300 flex-shrink-0" />

              {/* Node 3 - Qualification */}
              <div className="flex-1 max-w-[100px]">
                <div className="bg-white rounded-xl p-2.5 shadow-sm border border-gray-200">
                  <div className="w-7 h-7 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center mb-1.5 mx-auto">
                    <Filter className="h-3.5 w-3.5 text-gray-600" />
                  </div>
                  <p className="text-[10px] font-semibold text-gray-800 text-center">Qualify</p>
                </div>
              </div>

              <ArrowRight className="h-4 w-4 text-gray-300 flex-shrink-0" />

              {/* Node 4 - Intent Scoring */}
              <div className="flex-1 max-w-[100px]">
                <div className="bg-white rounded-xl p-2.5 shadow-sm border border-gray-200">
                  <div className="w-7 h-7 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center mb-1.5 mx-auto">
                    <Target className="h-3.5 w-3.5 text-gray-600" />
                  </div>
                  <p className="text-[10px] font-semibold text-gray-800 text-center">Intent score</p>
                </div>
              </div>

              <ArrowRight className="h-4 w-4 text-gray-300 flex-shrink-0" />

              {/* Branch Paths */}
              <div className="flex flex-col gap-1 flex-shrink-0">
                <div className="bg-emerald-50/70 border border-emerald-200/60 rounded px-2 py-1 flex items-center gap-1.5">
                  <Calendar className="h-3 w-3 text-emerald-600" />
                  <span className="text-[9px] text-gray-700 font-medium">Booking</span>
                </div>
                <div className="bg-white border border-gray-200 rounded px-2 py-1 flex items-center gap-1.5">
                  <Timer className="h-3 w-3 text-gray-500" />
                  <span className="text-[9px] text-gray-600 font-medium">Follow-up</span>
                </div>
                <div className="bg-white border border-gray-200 rounded px-2 py-1 flex items-center gap-1.5">
                  <UserCheck className="h-3 w-3 text-gray-500" />
                  <span className="text-[9px] text-gray-600 font-medium">Handoff</span>
                </div>
              </div>

              <ArrowRight className="h-4 w-4 text-gray-300 flex-shrink-0" />

              {/* Final Node - CRM Update */}
              <div className="flex-1 max-w-[110px]">
                <div className="bg-white rounded-xl p-2.5 shadow-sm border-2 border-emerald-200">
                  <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center mb-1.5 mx-auto">
                    <ClipboardList className="h-3.5 w-3.5 text-white" />
                  </div>
                  <p className="text-[10px] font-semibold text-gray-800 text-center">CRM update</p>
                  <div className="flex justify-center gap-0.5 mt-1">
                    <Badge className="text-[7px] bg-gray-100 text-gray-600 border-0 px-1 py-0">stage</Badge>
                    <Badge className="text-[7px] bg-gray-100 text-gray-600 border-0 px-1 py-0">tag</Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Tablet: Compact horizontal with wrapping */}
            <div className="hidden md:flex lg:hidden flex-wrap items-center justify-center gap-3">
              {/* First Row */}
              <div className="flex items-center gap-2">
                <div className="bg-white rounded-lg p-2 shadow-sm border border-gray-200 w-[80px]">
                  <div className="w-6 h-6 rounded bg-gray-100 border border-gray-200 flex items-center justify-center mb-1 mx-auto">
                    <MessageCircle className="h-3 w-3 text-gray-600" />
                  </div>
                  <p className="text-[9px] font-semibold text-gray-800 text-center">Inquiry</p>
                </div>
                <ArrowRight className="h-3 w-3 text-gray-300" />
                <div className="bg-white rounded-lg p-2 shadow-sm border border-gray-200 w-[80px]">
                  <div className="w-6 h-6 rounded bg-emerald-50 border border-emerald-200 flex items-center justify-center mb-1 mx-auto">
                    <Sparkles className="h-3 w-3 text-emerald-600" />
                  </div>
                  <p className="text-[9px] font-semibold text-gray-800 text-center">AI reply</p>
                </div>
                <ArrowRight className="h-3 w-3 text-gray-300" />
                <div className="bg-white rounded-lg p-2 shadow-sm border border-gray-200 w-[80px]">
                  <div className="w-6 h-6 rounded bg-gray-100 border border-gray-200 flex items-center justify-center mb-1 mx-auto">
                    <Filter className="h-3 w-3 text-gray-600" />
                  </div>
                  <p className="text-[9px] font-semibold text-gray-800 text-center">Qualify</p>
                </div>
                <ArrowRight className="h-3 w-3 text-gray-300" />
                <div className="bg-white rounded-lg p-2 shadow-sm border border-gray-200 w-[80px]">
                  <div className="w-6 h-6 rounded bg-gray-100 border border-gray-200 flex items-center justify-center mb-1 mx-auto">
                    <Target className="h-3 w-3 text-gray-600" />
                  </div>
                  <p className="text-[9px] font-semibold text-gray-800 text-center">Score</p>
                </div>
              </div>
              {/* Branches + CRM */}
              <div className="flex items-center gap-3 mt-2">
                <div className="flex gap-1.5">
                  <div className="bg-emerald-50/70 border border-emerald-200/60 rounded px-2 py-1 flex items-center gap-1">
                    <Calendar className="h-2.5 w-2.5 text-emerald-600" />
                    <span className="text-[8px] text-gray-700 font-medium">Book</span>
                  </div>
                  <div className="bg-white border border-gray-200 rounded px-2 py-1 flex items-center gap-1">
                    <Timer className="h-2.5 w-2.5 text-gray-500" />
                    <span className="text-[8px] text-gray-600">Nurture</span>
                  </div>
                  <div className="bg-white border border-gray-200 rounded px-2 py-1 flex items-center gap-1">
                    <UserCheck className="h-2.5 w-2.5 text-gray-500" />
                    <span className="text-[8px] text-gray-600">Human</span>
                  </div>
                </div>
                <ArrowRight className="h-3 w-3 text-gray-300" />
                <div className="bg-white rounded-lg p-2 shadow-sm border-2 border-emerald-200 w-[90px]">
                  <div className="w-6 h-6 rounded bg-emerald-600 flex items-center justify-center mb-1 mx-auto">
                    <ClipboardList className="h-3 w-3 text-white" />
                  </div>
                  <p className="text-[9px] font-semibold text-gray-800 text-center">CRM</p>
                </div>
              </div>
            </div>

            {/* Mobile: Vertical stack */}
            <div className="md:hidden space-y-3">
              {/* Step 1 */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
                  <MessageCircle className="h-4 w-4 text-gray-600" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gray-800">New inquiry received</p>
                  <p className="text-[10px] text-gray-500">Lead messages via WhatsApp</p>
                </div>
              </div>
              <div className="ml-4 w-px h-3 bg-gray-200" />
              
              {/* Step 2 */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gray-800">Instant AI reply</p>
                  <p className="text-[10px] text-gray-500">Context-aware response</p>
                </div>
              </div>
              <div className="ml-4 w-px h-3 bg-gray-200" />
              
              {/* Step 3 */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
                  <Filter className="h-4 w-4 text-gray-600" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gray-800">Qualification</p>
                  <p className="text-[10px] text-gray-500">Budget, timeline, readiness</p>
                </div>
              </div>
              <div className="ml-4 w-px h-3 bg-gray-200" />
              
              {/* Step 4 */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
                  <Target className="h-4 w-4 text-gray-600" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gray-800">Intent scoring</p>
                  <p className="text-[10px] text-gray-500">Lead qualification score</p>
                </div>
              </div>
              <div className="ml-4 w-px h-3 bg-gray-200" />
              
              {/* Branches */}
              <div className="flex flex-wrap gap-2 ml-11">
                <div className="bg-emerald-50/70 border border-emerald-200/60 rounded px-2.5 py-1.5 flex items-center gap-1.5">
                  <Calendar className="h-3 w-3 text-emerald-600" />
                  <span className="text-[10px] text-gray-700 font-medium">Booking</span>
                </div>
                <div className="bg-white border border-gray-200 rounded px-2.5 py-1.5 flex items-center gap-1.5">
                  <Timer className="h-3 w-3 text-gray-500" />
                  <span className="text-[10px] text-gray-600">Follow-up</span>
                </div>
                <div className="bg-white border border-gray-200 rounded px-2.5 py-1.5 flex items-center gap-1.5">
                  <UserCheck className="h-3 w-3 text-gray-500" />
                  <span className="text-[10px] text-gray-600">Handoff</span>
                </div>
              </div>
              <div className="ml-4 w-px h-3 bg-gray-200" />
              
              {/* CRM Update */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0">
                  <ClipboardList className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gray-800">CRM update</p>
                  <div className="flex gap-1 mt-0.5">
                    <Badge className="text-[8px] bg-gray-100 text-gray-600 border-0 px-1.5 py-0">stage</Badge>
                    <Badge className="text-[8px] bg-gray-100 text-gray-600 border-0 px-1.5 py-0">tag</Badge>
                    <Badge className="text-[8px] bg-gray-100 text-gray-600 border-0 px-1.5 py-0">score</Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 text-sm text-gray-600 bg-emerald-50/50 rounded-lg px-4 py-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            <span className="text-xs">All paths update your CRM so your pipeline stays accurate in real time.</span>
          </div>
        </section>

        {/* Inside your workspace */}
        <section className="bg-white rounded-2xl p-6 md:p-8 mb-6 border border-gray-200/80 shadow-sm">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-1">Inside your workspace</h2>
          <p className="text-gray-500 text-sm mb-6">Representative surfaces this engine uses — from inbox to automations and pipeline.</p>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Inbox + Copilot */}
            <div className="group">
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-emerald-200 hover:shadow-md transition-all mb-3">
                <div className="bg-gray-800 px-3 py-2 flex items-center justify-between">
                  <span className="text-white text-[10px] font-semibold">Inbox</span>
                  <div className="flex items-center gap-1.5">
                    <Search className="h-3 w-3 text-white/60" />
                    <Bell className="h-3 w-3 text-white/60" />
                  </div>
                </div>
                <div className="p-2 space-y-1.5">
                  <div className="bg-emerald-50/60 rounded-lg p-2 flex items-center gap-2 border border-emerald-100">
                    <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                      <span className="text-gray-600 text-[8px] font-bold">SM</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-semibold text-gray-800 truncate">Sarah Mitchell</p>
                      <p className="text-[8px] text-gray-500 truncate">3BR in Miami...</p>
                    </div>
                    <span className="w-4 h-4 rounded-full bg-emerald-500 text-white text-[8px] flex items-center justify-center flex-shrink-0">3</span>
                  </div>
                  <div className="rounded-lg p-2 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                      <span className="text-gray-600 text-[8px] font-bold">JD</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-semibold text-gray-800 truncate">John Davis</p>
                      <p className="text-[8px] text-gray-500 truncate">Property viewing?</p>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 p-2 border-t border-gray-100">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 text-emerald-600" />
                    <span className="text-[9px] text-gray-600 font-medium">AI: Reply with times</span>
                  </div>
                </div>
              </div>
              <h3 className="font-semibold text-gray-900 text-sm mb-0.5">Inbox + Copilot</h3>
              <p className="text-gray-500 text-xs leading-relaxed">AI drafts and smart replies inside your unified inbox.</p>
            </div>

            {/* Flow automation */}
            <div className="group">
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-emerald-200 hover:shadow-md transition-all mb-3">
                <div className="bg-gray-800 px-3 py-2 flex items-center justify-between">
                  <span className="text-white text-[10px] font-semibold">Automations</span>
                  <Plus className="h-3 w-3 text-white/60" />
                </div>
                <div className="p-3 bg-gray-50">
                  <div className="flex flex-col items-center gap-1">
                    <div className="bg-white border border-gray-200 rounded px-2 py-1 text-[8px] font-medium text-gray-700 flex items-center gap-1">
                      <Zap className="h-2.5 w-2.5 text-gray-500" /> New Lead
                    </div>
                    <div className="w-px h-2 bg-gray-300" />
                    <div className="bg-emerald-50 border border-emerald-200 rounded px-2 py-1 text-[8px] font-medium text-emerald-700 flex items-center gap-1">
                      <Sparkles className="h-2.5 w-2.5" /> AI Qualify
                    </div>
                    <div className="w-px h-2 bg-gray-300" />
                    <div className="flex items-center gap-1.5">
                      <div className="bg-white border border-gray-200 rounded px-1.5 py-0.5 text-[7px] font-medium text-gray-600">Wait</div>
                      <div className="bg-white border border-gray-200 rounded px-1.5 py-0.5 text-[7px] font-medium text-gray-600">If reply</div>
                    </div>
                    <div className="w-px h-2 bg-gray-300" />
                    <div className="bg-white border border-gray-200 rounded px-2 py-1 text-[8px] font-medium text-gray-700 flex items-center gap-1">
                      <Calendar className="h-2.5 w-2.5 text-gray-500" /> Book
                    </div>
                  </div>
                </div>
                <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-[8px] text-gray-500">Lead Nurture</span>
                  <Badge className="text-[7px] bg-emerald-100 text-emerald-700 border-0 px-1.5 py-0">Active</Badge>
                </div>
              </div>
              <h3 className="font-semibold text-gray-900 text-sm mb-0.5">Flow automation</h3>
              <p className="text-gray-500 text-xs leading-relaxed">Visual flows that run so you never miss a lead.</p>
            </div>

            {/* Pipeline / Tasks */}
            <div className="group">
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-emerald-200 hover:shadow-md transition-all mb-3">
                <div className="bg-gray-800 px-3 py-2 flex items-center justify-between">
                  <span className="text-white text-[10px] font-semibold">Pipeline</span>
                  <Filter className="h-3 w-3 text-white/60" />
                </div>
                <div className="p-2 flex gap-1.5 overflow-hidden">
                  <div className="flex-1 min-w-0">
                    <div className="text-[7px] text-gray-500 font-medium mb-1 px-0.5">NEW</div>
                    <div className="bg-gray-50 rounded p-1 space-y-1">
                      <div className="bg-white rounded p-1.5 shadow-sm border border-gray-100">
                        <p className="text-[8px] font-medium text-gray-800">Sarah M.</p>
                        <span className="text-[7px] text-emerald-600">$600k</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[7px] text-gray-500 font-medium mb-1 px-0.5">QUAL</div>
                    <div className="bg-emerald-50/50 rounded p-1 space-y-1">
                      <div className="bg-white rounded p-1.5 shadow-sm border border-gray-100">
                        <p className="text-[8px] font-medium text-gray-800">John D.</p>
                        <span className="text-[7px] text-gray-600">$800k</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[7px] text-gray-500 font-medium mb-1 px-0.5">SHOW</div>
                    <div className="bg-gray-50 rounded p-1">
                      <div className="bg-white rounded p-1.5 shadow-sm border border-gray-100">
                        <p className="text-[8px] font-medium text-gray-800">Mike R.</p>
                        <span className="text-[7px] text-gray-500">Tmrw</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-[8px] text-gray-500">12 leads</span>
                  <span className="text-[8px] text-emerald-600 font-medium">$4.2M</span>
                </div>
              </div>
              <h3 className="font-semibold text-gray-900 text-sm mb-0.5">Pipeline / Tasks</h3>
              <p className="text-gray-500 text-xs leading-relaxed">Leads move stages automatically.</p>
            </div>

            {/* Template follow-up */}
            <div className="group">
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-emerald-200 hover:shadow-md transition-all mb-3">
                <div className="bg-gray-800 px-3 py-2 flex items-center justify-between">
                  <span className="text-white text-[10px] font-semibold">Templates</span>
                  <Settings className="h-3 w-3 text-white/60" />
                </div>
                <div className="p-2 space-y-1.5">
                  <div className="bg-gray-50 rounded-lg p-2 border border-gray-100">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[9px] font-semibold text-gray-800">24h Follow-up</span>
                      <Badge className="text-[7px] bg-emerald-100 text-emerald-700 border-0 px-1 py-0">Approved</Badge>
                    </div>
                    <p className="text-[8px] text-gray-500">Hi {'{name}'}, following up on...</p>
                  </div>
                  <div className="bg-white rounded-lg p-2 border border-gray-100">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[9px] font-semibold text-gray-800">Showing Reminder</span>
                      <Badge className="text-[7px] bg-emerald-100 text-emerald-700 border-0 px-1 py-0">Approved</Badge>
                    </div>
                    <p className="text-[8px] text-gray-500">Reminder: Showing on {'{date}'}...</p>
                  </div>
                  <div className="bg-white rounded-lg p-2 border border-gray-100">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[9px] font-semibold text-gray-800">Re-engagement</span>
                      <Badge className="text-[7px] bg-gray-100 text-gray-600 border-0 px-1 py-0">Pending</Badge>
                    </div>
                    <p className="text-[8px] text-gray-500">New listings that match...</p>
                  </div>
                </div>
              </div>
              <h3 className="font-semibold text-gray-900 text-sm mb-0.5">Template follow-up</h3>
              <p className="text-gray-500 text-xs leading-relaxed">Approved templates with rule-based timing.</p>
            </div>
          </div>
        </section>

        {/* Requirements & Onboarding */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          {/* Requirements */}
          <section className="bg-white rounded-2xl p-6 border border-gray-200/80 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Requirements</h2>
            <p className="text-gray-500 text-xs mb-4">What must be true before this engine can run end-to-end.</p>

            <div className="space-y-2.5">
              {[
                "Requires Pro plan",
                "Requires AI Brain",
                "WhatsApp Business connected for live automations",
                "Approved templates may be needed for re-engagement",
                "Concierge onboarding included with purchase",
              ].map((req, index) => (
                <div key={index} className="flex items-start gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="h-2.5 w-2.5 text-emerald-600" />
                  </div>
                  <span className="text-gray-600 text-sm">{req}</span>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-gray-400 mt-4 leading-relaxed">
              WhatsApp messaging fees are billed by Meta. Premium add-ons follow your billing provider&apos;s checkout rules.
            </p>
          </section>

          {/* Premium onboarding */}
          <section className="bg-white rounded-2xl p-6 border border-gray-200/80 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Premium onboarding & concierge</h2>
            <p className="text-gray-500 text-xs mb-4">We stay with you until the system is live.</p>

            <div className="space-y-2.5">
              {[
                "White-glove setup with a launch specialist",
                "Channel validation (WhatsApp, Meta, web chat)",
                "Workflow review against your market and offer",
                "Launch optimization to tune qualification paths",
                "Go-live checklist matching how you work",
              ].map((item, index) => (
                <div key={index} className="flex items-start gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="h-2.5 w-2.5 text-emerald-600" />
                  </div>
                  <span className="text-gray-600 text-sm">{item}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* CTA Section - Premium */}
        <section className="relative bg-gradient-to-br from-[#0a1f17] via-[#0f2920] to-[#143d2e] rounded-2xl p-8 md:p-10 text-center overflow-hidden">
          {/* Ambient glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 bg-emerald-500/20 rounded-full blur-3xl" />
          
          <div className="relative">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">Ready to run this in your workspace?</h2>
            <p className="text-emerald-100/80 mb-6 max-w-md mx-auto text-sm">Activate the Realtor Growth Engine to unlock checkout and guided concierge onboarding.</p>
            
            <Button className="bg-emerald-500 hover:bg-emerald-400 text-white px-8 py-5 rounded-xl font-semibold text-base shadow-lg shadow-emerald-900/30 hover:shadow-emerald-500/20 transition-all">
              Activate Engine
              <ChevronRight className="h-5 w-5 ml-1.5" />
            </Button>

            <div className="flex flex-wrap items-center justify-center gap-3 mt-6 text-xs text-emerald-200/70">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                One-time template license
              </span>
              <span className="hidden sm:inline text-emerald-200/30">•</span>
              <span>Requires Pro + AI Brain</span>
              <span className="hidden sm:inline text-emerald-200/30">•</span>
              <span>WhatsApp connects before activation</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
