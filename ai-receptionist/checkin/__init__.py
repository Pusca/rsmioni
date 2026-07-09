"""Receptionist AI di RS Mioni — package del worker LiveKit Agents.

Moduli:
    config   — impostazioni da ambiente, validate all'avvio
    backend  — client HTTP verso le API di dominio di Laravel
    fsm      — macchina a stati del check-in/out (fasi, gate, escalation)
    prompts  — istruzioni per il modello, per scopo
    ui       — pubblicazione dello stato sullo schermo del chiosco
    agents   — l'Agent LiveKit con i tool di dominio governati dalla FSM
"""
