import os
import requests
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

def generate_response(prompt, context=''):
    # System instructions to keep it focused on HNDIT
    system_instruction = f'''
    You are an AI assistant for HNDIT students at SLIATE.
    Use the following context from the syllabus to answer the user:
    
    Context: {context}
    '''
    
    # 1. TRY OLLAMA (Local/Offline)
    try:
        ollama_url = 'http://localhost:11434/api/generate'
        payload = {
            'model': 'llama3',
            'prompt': f'{system_instruction}\n\nUser Question: {prompt}',
            'stream': False
        }
        # 2-second timeout: if Ollama isn't open, it skips quickly
        response = requests.post(ollama_url, json=payload, timeout=2)
        if response.status_code == 200:
            return '[Local Llama3] ' + response.json().get('response', '')
    except:
        pass

    # 2. FALLBACK TO GEMINI (Online/Cloud)
    try:
        api_key = os.getenv('GEMINI_API_KEY')
        if not api_key:
            return 'Error: No Gemini API Key found in .env and Ollama is offline.'
        
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-flash')
        full_prompt = f'{system_instruction}\n\nUser Question: {prompt}'
        
        response = model.generate_content(full_prompt)
        return '[Cloud Gemini] ' + response.text
    except Exception as e:
        return f'All AI systems offline. Error: {str(e)}'
