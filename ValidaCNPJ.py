#!/usr/bin/env python3
#VALIDA CNPJ E CEP
import pandas as pd
import requests
import re
import time
import os
from pandas import json_normalize
from validate_docbr import CNPJ
from datetime import datetime
from datetime import date

def validaCNPJ(cnpj):
    cnpj = '{:0>14}'.format(cnpj)
    regex_syntax = r"\D"
    cnpj = re.sub(regex_syntax, "", cnpj)
    valida = CNPJ()
    if len(cnpj)!=14:
        print('CNPJ inválido. Quantidade de caracteres incorreto.')
        return None
    else:
        padrao = '[0-9]{14}'
        cnpj = re.search(padrao, cnpj)
        cnpj = cnpj.group()
        validate = valida.validate(cnpj)
        if validate:
            print('CNPJ {} válido!'.format(cnpj))
            return cnpj
        else:
            raise Exception('CNPJ inválido. Não atende ao algoritmo da Receita Federal.')
 
def processaCNPJ(cnpj):
    cnpj = str(cnpj)
    cnpj = '{:0>14}'.format(cnpj)
    url = 'https://www.receitaws.com.br/v1/cnpj/{}'.format(cnpj)
    r = requests.get(url)
    try:
        rfb = r.json()
        objeto = json_normalize(rfb)
        qsa = objeto.qsa
        atividade_principal = objeto.atividade_principal
        atividades_secundarias = objeto.atividades_secundarias
        cadastro = objeto.drop(columns=['atividade_principal',
                                        'atividades_secundarias',
                                        'qsa','billing.free',
                                        'billing.database'])
        print('{} encontrado! - {}'.format(cnpj, datetime.today()))
        return cadastro.T, quadroSocietario(qsa), atividadesCNPJ(atividade_principal, atividades_secundarias)
    except:
        print('{} não encontrado! - {}'.format(cnpj, datetime.today()))
        return None
 
def extraiDadosCNPJ(listagem):
    dicionario = listagem[0]
    final = pd.DataFrame()
    contador = 0
 
    while(contador<(len(dicionario))):
        registro = dicionario[contador]
        registro = pd.DataFrame.from_dict(registro, orient='index').T
        final = pd.concat([final, registro])
        contador += 1
    return final
 
def quadroSocietario(qsa):
    quadro_societario = extraiDadosCNPJ(qsa)
    quadro_societario['cnpj'] = cnpj
    quadro_societario.set_index('cnpj', inplace=True)
    return quadro_societario
 
def atividadesCNPJ(atividade_principal, atividades_secundarias):
    atividades = pd.DataFrame()
    at1 = extraiDadosCNPJ(atividade_principal)
    at1['tipo'] = 'principal'
    at1['cnpj'] = cnpj
    at2 = extraiDadosCNPJ(atividades_secundarias)
    at2['tipo'] = 'secundaria'
    at2['cnpj'] = cnpj
    atividades = pd.concat([atividades, at1])
    atividades = pd.concat([atividades, at2])
    atividades.set_index('cnpj', inplace=True)
    return atividades
 
def buscaCEP(cep, numero, nome):
    cep = str(cep)
    regex_syntax = r"\D"
    cep = re.sub(regex_syntax, "", cep)
    if len(cep) == 8 or len(cep) == 9 or len(cep) == 10:
        padrao = '[0-9]{2}.?[0-9]{3}-?[0-9]{3}'
        cep = re.search(padrao, cep)
        cep = cep.group()
        cep = cep.replace('-','')
        url = 'https://viacep.com.br/ws/{}/json'.format(cep)
        r = requests.get(url)
        local = r.json()
        try:
            local = json_normalize(local)
            local['nome'] = nome
            local['unidade'] = numero
            local['data_consulta'] = date.today()
            local.set_index('nome', inplace=True)
            local.rename(columns={'unidade':'numero'}, inplace=True)
            local.drop(['ibge','gia'], axis=1,inplace=True)
            return local.T
        except:
            print(local)
    else:
        print('CEP inválido')
        return None
 
cnpj = input('Digite o CNPJ: ')
cnpj = validaCNPJ(cnpj)
cadastro, quadroSocietario, atividadesCNPJ = processaCNPJ(cnpj)
 
print(cadastro) 
print(quadroSocietario)
print(atividadesCNPJ)
 
endereco = buscaCEP(cadastro.T['cep'][0], cadastro.T['numero'][0], 
cadastro.T['nome'][0])
print(endereco)
 
arquivo = '{}.xlsx'.format(cnpj)
with pd.ExcelWriter(arquivo) as writer:
    cadastro.to_excel(writer, sheet_name='cadastro')
    endereco.to_excel(writer, sheet_name='endereco')
    quadroSocietario.to_excel(writer, sheet_name='quadroSocietario')
    atividadesCNPJ.to_excel(writer, sheet_name='atividadesCNPJ')
 
exit
